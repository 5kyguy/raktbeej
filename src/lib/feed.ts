/**
 * Read/write pipeline over bee-js feeds.
 *
 * Publishing targets the public Swarm gateway (bee-js `SWARM_GATEWAY_URL`
 * with `NULL_STAMP`, anonymous free tier); the fallback chain (gift-card
 * stamp, beeport, local Bee) is wired through the endpoint overrides in
 * `bee.ts`.
 *
 * Reading is trustless: instead of asking a node to resolve the latest
 * update (`GET /feeds` — which the reader would have to take on faith),
 * the reader walks the feed indices itself, fetching each update's raw
 * single-owner chunk from the drops and verifying the signature against
 * the owner address in the link. The publisher uses the same verified
 * walk — even it does not trust the node it writes through.
 *
 * The pipeline per publish:
 *   post body  → immutable /bytes upload
 *   manifest   → immutable /bytes upload (previous posts + the new one)
 *   feed       → signed update pointing at the manifest (single-owner chunk)
 */

import { BeeResponseError, FeedIndex, PrivateKey, Topic } from '@ethersphere/bee-js'

import { getEndpoint, makeBee } from './bee'
import { activeDrops, beeForDrop, spill } from './gateways'
import type { Drop, Spilled } from './gateways'
import type { RaktbeejLink } from './link'
import {
  buildNextPayload,
  encodeManifest,
  encodePayload,
  parseManifest,
  parsePayload,
} from './protocol'
import type { FeedPayload, Manifest, PostEntry, Ref } from './protocol'
import { VerificationRefused, feedChunkAddress, isTamper, verifySocChunk } from './verify'
import type { SingleOwnerChunk } from '@ethersphere/core-sdk'

export interface VerifiedUpdate {
  /** Feed index of the latest update. */
  index: bigint
  payload: FeedPayload
  /** Canonical bytes as published — the prev-hash input. */
  json: string
  /** Drop that served the latest chunk. */
  drop: Drop
}

export interface PublishResult {
  postRef: Ref
  manifestRef: Ref
  payload: FeedPayload
}

/**
 * Resolve the latest update through the configured write endpoint's
 * `/feeds` — used by the publisher for chaining. The write node is
 * authoritative for where the next update will be placed, and its view is
 * immediately fresh for feeds it has just written (cross-drop chunk
 * retrieval lags by seconds to minutes). Readers never use this path:
 * they walk and verify (readLatestVerified).
 */
async function readLatestFromWriteNode(link: RaktbeejLink): Promise<VerifiedUpdate | null> {
  const reader = makeBee().feed.makeReader(Topic.fromString(link.topic), link.owner)
  try {
    const result = await reader.downloadPayload()
    const json = result.payload.toUtf8()
    return { index: result.feedIndex.toBigInt(), payload: parsePayload(json), json, drop: { id: 'write-node', origin: '', subdomain: false } }
  } catch (err) {
    if (err instanceof BeeResponseError && err.status === 404) return null
    throw err
  }
}

/** Safety cap for the index walk — a corrupt feed must not hang the reader. */
const MAX_WALK = 1000

/** Generate a dedicated publisher key. Never use a wallet that holds funds. */
export function generateKeyHex(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return new PrivateKey(bytes).toHex()
}

/** Owner address (40 hex chars, no 0x) of a publisher key. */
export function ownerAddress(keyHex: string): string {
  return new PrivateKey(keyHex).publicKey().address().toHex()
}

/**
 * Fetch and verify the feed chunk at `index`. Returns null when no drop has
 * the chunk (a miss — typically the slot after the latest update). Throws
 * {@link VerificationRefused} when any drop served bytes that do not verify
 * against the link's owner, and rethrows the last real fault when every
 * drop failed for non-miss reasons.
 */
async function fetchVerifiedChunk(
  link: RaktbeejLink,
  index: bigint,
): Promise<{ soc: SingleOwnerChunk; drop: Drop } | null> {
  const address = feedChunkAddress(link.topic, FeedIndex.fromBigInt(index), link.owner)
  let sawTamper = false
  let lastFault: unknown

  for (const drop of activeDrops()) {
    try {
      const bytes = await beeForDrop(drop).chunk.download(address)
      return { soc: verifySocChunk(bytes, address), drop }
    } catch (err) {
      if (isTamper(err)) {
        sawTamper = true
      } else if (err instanceof BeeResponseError && err.status === 404) {
        // miss on this drop — try the next
      } else {
        lastFault = err
      }
    }
  }

  if (sawTamper) throw new VerificationRefused(address)
  if (lastFault !== undefined) throw lastFault
  return null
}

/**
 * Walk the feed indices from `from` (default 0) until a slot is missing on
 * every drop, verifying each chunk's signature client-side. Returns the
 * latest verified update, or null when the feed has no updates at all.
 */
export async function readLatestVerified(
  link: RaktbeejLink,
  options?: { from?: bigint },
): Promise<VerifiedUpdate | null> {
  let index = options?.from ?? 0n
  let latest: VerifiedUpdate | null = null

  for (let step = 0; step < MAX_WALK; step++, index++) {
    const found = await fetchVerifiedChunk(link, index)
    if (!found) return latest
    const json = found.soc.payload.toUtf8()
    latest = { index, payload: parsePayload(json), json, drop: found.drop }
  }

  throw new Error(`readLatestVerified: walked past ${MAX_WALK} indices without an end`)
}

/** Download immutable content (manifest / post body) from the first drop that has it. */
export async function downloadText(ref: Ref): Promise<Spilled<string>> {
  return spill(async (drop) => (await beeForDrop(drop).data.download(ref)).toUtf8())
}

async function uploadBytes(data: string): Promise<Ref> {
  const { batchId } = getEndpoint()
  const result = await makeBee().data.upload(batchId, data)
  return result.reference.toHex()
}

/** Publish a post and advance the feed. */
export async function publishPost(
  keyHex: string,
  link: RaktbeejLink,
  title: string,
  markdown: string,
): Promise<PublishResult> {
  const trimmed = title.trim()
  if (!trimmed) throw new Error('publishPost: title is required')

  const bee = makeBee()
  const signer = new PrivateKey(keyHex)
  const owner = signer.publicKey().address().toHex()
  if (owner !== link.owner) {
    throw new Error(`publishPost: key ${owner} does not own feed ${link.owner}`)
  }

  const latest = await readLatestFromWriteNode(link)
  let posts: PostEntry[] = []
  if (latest) {
    const previous = await bee.data.download(latest.payload.manifest)
    posts = parseManifest(previous.toUtf8()).posts
  }

  const ts = Date.now()
  const postRef = await uploadBytes(markdown)
  const manifest: Manifest = { v: 1, posts: [...posts, { title: trimmed, ts, ref: postRef }] }
  const manifestRef = await uploadBytes(encodeManifest(manifest))
  const payload = buildNextPayload(latest, manifestRef, ts)

  const writer = bee.feed.makeWriter(Topic.fromString(link.topic), signer)
  await writer.uploadPayload(getEndpoint().batchId, encodePayload(payload))

  return { postRef, manifestRef, payload }
}
