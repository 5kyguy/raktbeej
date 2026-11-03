/**
 * Read/write pipeline over bee-js feeds.
 *
 * Publishing targets the public Swarm gateway (bee-js `SWARM_GATEWAY_URL`
 * with `NULL_STAMP`, anonymous free tier); the fallback chain (gift-card
 * stamp, beeport, local Bee) is wired through the endpoint overrides in
 * `bee.ts`.
 *
 * The pipeline per publish:
 *   post body  → immutable /bytes upload
 *   manifest   → immutable /bytes upload (previous posts + the new one)
 *   feed       → signed update pointing at the manifest (single-owner chunk)
 */

import { BeeResponseError, PrivateKey, Topic } from '@ethersphere/bee-js'

import { getEndpoint, makeBee } from './bee'
import type { RaktbeejLink } from './link'
import {
  buildNextPayload,
  encodeManifest,
  encodePayload,
  parseManifest,
  parsePayload,
} from './protocol'
import type { FeedPayload, Manifest, PostEntry, Ref } from './protocol'

export interface LatestUpdate {
  /** Raw canonical JSON of the latest feed chunk — the prev-hash input. */
  json: string
  payload: FeedPayload
}

export interface PublishResult {
  postRef: Ref
  manifestRef: Ref
  payload: FeedPayload
}

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
 * Fetch the latest update for a link. Returns null when the feed has no
 * updates yet (Bee answers 404 for a missing single-owner chunk).
 */
export async function readLatest(link: RaktbeejLink): Promise<LatestUpdate | null> {
  const bee = makeBee()
  const reader = bee.feed.makeReader(Topic.fromString(link.topic), link.owner)
  try {
    const result = await reader.downloadPayload()
    const json = result.payload.toUtf8()
    return { json, payload: parsePayload(json) }
  } catch (err) {
    if (err instanceof BeeResponseError && err.status === 404) return null
    throw err
  }
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

  const latest = await readLatest(link)
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
