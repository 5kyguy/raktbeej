/**
 * Raktbeej wire formats.
 *
 * Feed updates are single-owner chunks, so a payload must stay well under
 * 4 KB. The payload therefore only points at an immutable manifest, which in
 * turn points at immutable posts. `prev` hashes the previous payload's
 * bytes, forming the bloodline: a history that cannot be silently rewritten.
 */

/** Swarm reference: 32 bytes, 64 hex chars, no 0x prefix. */
export type Ref = string

export interface FeedPayload {
  v: 1
  /** unix ms when this update was published */
  ts: number
  /** hash of the previous payload, null for the first update */
  prev: Ref | null
  /** reference of the manifest this update points at */
  manifest: Ref
}

export interface PostEntry {
  title: string
  /** unix ms of publication */
  ts: number
  /** reference of the immutable post body */
  ref: Ref
}

export interface Manifest {
  v: 1
  posts: PostEntry[]
}

/** A seed: the pubsub announce message for a new feed update. */
export interface Seed {
  type: 'seed'
  ts: number
  manifest: Ref
  index: number
}

const REF_RE = /^[0-9a-f]{64}$/

export function isRef(value: unknown): value is Ref {
  return typeof value === 'string' && REF_RE.test(value)
}

function hasShape(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return keys.every((key) => key in record)
}

export function isFeedPayload(value: unknown): value is FeedPayload {
  if (!hasShape(value, ['v', 'ts', 'prev', 'manifest'])) return false
  const v = value as Record<string, unknown>
  return (
    v.v === 1 &&
    typeof v.ts === 'number' &&
    (v.prev === null || isRef(v.prev)) &&
    isRef(v.manifest)
  )
}

export function isPostEntry(value: unknown): value is PostEntry {
  if (!hasShape(value, ['title', 'ts', 'ref'])) return false
  const v = value as Record<string, unknown>
  return typeof v.title === 'string' && v.title.length > 0 && typeof v.ts === 'number' && isRef(v.ref)
}

export function isManifest(value: unknown): value is Manifest {
  if (!hasShape(value, ['v', 'posts'])) return false
  const v = value as Record<string, unknown>
  return v.v === 1 && Array.isArray(v.posts) && v.posts.every(isPostEntry)
}

export function isSeed(value: unknown): value is Seed {
  if (!hasShape(value, ['type', 'ts', 'manifest', 'index'])) return false
  const v = value as Record<string, unknown>
  return (
    v.type === 'seed' && typeof v.ts === 'number' && isRef(v.manifest) && typeof v.index === 'number'
  )
}
