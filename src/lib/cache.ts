/**
 * The last-good offline cache: after any verified render, the publication
 * is stored locally. When every drop is unreachable — or taken down — the
 * reader keeps showing the latest copy it verified. The cache is never
 * trusted as fresh: it is marked with when it was saved and which drop
 * served it.
 */

import type { RaktbeejLink } from './link'
import { isFeedPayload, isManifest, isPostEntry } from './protocol'
import type { FeedPayload, Manifest, PostEntry } from './protocol'

export interface CachedPost extends PostEntry {
  /** Post body fetched at cache time (may be absent if a drop lost it). */
  body?: string
}

export interface CachedPublication {
  /** unix ms when this copy was verified and saved */
  savedAt: number
  /** index of the feed update this copy came from (string — bigint-safe) */
  index: string
  /** drop that served the feed chunk */
  drop: string
  payload: FeedPayload
  manifest: Manifest
  posts: CachedPost[]
}

const key = (link: RaktbeejLink): string => `raktbeej:read:${link.owner}:${link.topic}`

function isCachedPublication(value: unknown): value is CachedPublication {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.savedAt === 'number' &&
    typeof v.index === 'string' &&
    typeof v.drop === 'string' &&
    isFeedPayload(v.payload) &&
    isManifest(v.manifest) &&
    Array.isArray(v.posts) &&
    v.posts.every(
      (post) =>
        isPostEntry(post) &&
        (typeof (post as CachedPost).body === 'string' ||
          (post as CachedPost).body === undefined),
    )
  )
}

export function loadCache(link: RaktbeejLink): CachedPublication | null {
  try {
    const raw = localStorage.getItem(key(link))
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    return isCachedPublication(value) ? value : null
  } catch {
    return null
  }
}

export function saveCache(link: RaktbeejLink, publication: CachedPublication): void {
  try {
    localStorage.setItem(key(link), JSON.stringify(publication))
  } catch {
    // quota or private mode — the cache is best-effort, never fatal
  }
}
