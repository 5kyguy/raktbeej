/**
 * End-to-end publish test against the public Swarm gateway.
 *
 * Not part of the default suite — writes to Swarm (free tier) and needs the
 * network. Run explicitly:
 *
 *   RAKTBEEJ_E2E=1 npx vitest run tests/e2e-gateway.test.ts
 *
 * Exercises the exact M1 path: NULL_STAMP uploads + signed feed update
 * through api.gateway.ethswarm.org, then readback of the feed and manifest.
 */

import { describe, expect, it } from 'vitest'

import { generateKeyHex, ownerAddress, publishPost, readLatest } from '../src/lib/feed'
import type { RaktbeejLink } from '../src/lib/link'
import { makeBee } from '../src/lib/bee'
import { encodePayload, hashJson, parseManifest } from '../src/lib/protocol'

const run = !!process.env.RAKTBEEJ_E2E
const d = run ? describe : describe.skip

d('publish pipeline against the swarm gateway (M1 success test)', () => {
  it('publishes two posts and reads the chain back', { timeout: 120_000 }, async () => {
    const keyHex = generateKeyHex()
    const link: RaktbeejLink = { owner: ownerAddress(keyHex), topic: `e2e-${Date.now()}` }

    expect(await readLatest(link)).toBeNull()

    const first = await publishPost(keyHex, link, 'first drop', 'every copy is a seed')
    expect(first.payload.prev).toBeNull()

    const second = await publishPost(keyHex, link, 'second drop', 'take one down, it regrows')
    expect(second.payload.prev).toBe(hashJson(encodePayload(first.payload)))

    const latest = await readLatest(link)
    expect(latest).not.toBeNull()
    expect(latest!.payload.manifest).toBe(second.manifestRef)
    expect(latest!.payload.prev).toBe(hashJson(encodePayload(first.payload)))

    const manifestBytes = await makeBee().data.download(latest!.payload.manifest)
    const manifest = parseManifest(manifestBytes.toUtf8())
    expect(manifest.posts.map((post) => post.title)).toEqual(['first drop', 'second drop'])
    expect(manifest.posts[1].ref).toBe(second.postRef)
  })
})
