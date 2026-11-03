/**
 * End-to-end publish + verified read against the public Swarm gateway.
 *
 * Not part of the default suite — writes to Swarm (free tier) and needs the
 * network. Run explicitly:
 *
 *   RAKTBEEJ_E2E=1 npx vitest run tests/e2e-gateway.test.ts
 *
 * Exercises the exact M1/M2 paths: NULL_STAMP uploads + signed feed update
 * through api.gateway.ethswarm.org, then the trustless reader walk — raw
 * chunk fetches from the drops, client-side signature verification, index
 * walk to the latest update, manifest + post readback.
 */

import { describe, expect, it } from 'vitest'

import { makeBee } from '../src/lib/bee'
import { downloadText, generateKeyHex, ownerAddress, publishPost, readLatestVerified } from '../src/lib/feed'
import type { RaktbeejLink } from '../src/lib/link'
import { encodePayload, hashJson, parseManifest } from '../src/lib/protocol'

const run = !!process.env.RAKTBEEJ_E2E
const d = run ? describe : describe.skip

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Swarm chunk retrieval is eventually consistent — poll until seen or timeout. */
async function waitFor<T>(
  probe: () => Promise<T>,
  ready: (value: T) => boolean,
  timeoutMs = 120_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await probe()
    if (ready(value)) return value
    if (Date.now() > deadline) return value
    await sleep(5_000)
  }
}

d('publish + verified read against the swarm gateway (M1/M2 success test)', () => {
  it('publishes two posts and reads the chain back, verified', { timeout: 180_000 }, async () => {
    const keyHex = generateKeyHex()
    const link: RaktbeejLink = { owner: ownerAddress(keyHex), topic: `e2e-${Date.now()}` }

    expect(await readLatestVerified(link)).toBeNull()

    const first = await publishPost(keyHex, link, 'first drop', 'every copy is a **seed**')
    expect(first.payload.prev).toBeNull()

    const second = await publishPost(keyHex, link, 'second drop', 'take one down, it regrows')
    expect(second.payload.prev).toBe(hashJson(encodePayload(first.payload)))

    // the verified walk sees the newest update once retrieval propagates
    const latest = await waitFor(
      () => readLatestVerified(link),
      (value) => value?.index === 1n,
    )
    expect(latest).not.toBeNull()
    expect(latest!.index).toBe(1n)
    expect(latest!.payload.manifest).toBe(second.manifestRef)
    expect(latest!.payload.prev).toBe(hashJson(encodePayload(first.payload)))

    // verified walk can resume from a known index (the cache path)
    const resumed = await readLatestVerified(link, { from: 1n })
    expect(resumed!.index).toBe(1n)

    const manifestJson = await downloadText(latest!.payload.manifest)
    const manifest = parseManifest(manifestJson.value)
    expect(manifest.posts.map((post) => post.title)).toEqual(['first drop', 'second drop'])

    const body = await downloadText(manifest.posts[1].ref)
    expect(body.value).toBe('take one down, it regrows')

    // and the manifest is where the publisher's bee put it, byte-identical
    const viaApi = await makeBee().data.download(latest!.payload.manifest)
    expect(viaApi.toUtf8()).toBe(manifestJson.value)
  })
})
