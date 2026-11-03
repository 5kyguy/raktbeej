/**
 * Read/write wrappers over bee-js feeds.
 *
 * Publishing targets the public Swarm gateway (bee-js `SWARM_GATEWAY_URL`
 * with `NULL_STAMP`); the fallback chain (gift-card stamp, beeport, local
 * Bee) is documented in the build plan.
 */

import type { RaktbeejLink } from './link'
import type { FeedPayload, Manifest } from './protocol'

/** Fetch the latest payload for a link. Implemented in M2. */
export async function readLatest(_link: RaktbeejLink): Promise<FeedPayload> {
  throw new Error('readLatest: not implemented (M2)')
}

/** Upload an immutable manifest. Implemented in M1. */
export async function uploadManifest(_manifest: Manifest): Promise<string> {
  throw new Error('uploadManifest: not implemented (M1)')
}

/** Publish a post and advance the feed. Implemented in M1. */
export async function publishPost(_title: string, _markdown: string): Promise<void> {
  throw new Error('publishPost: not implemented (M1)')
}
