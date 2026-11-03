/**
 * Client-side verification of feed updates.
 *
 * A feed update is a single-owner chunk: a payload signed by the owner key.
 * The reader verifies the signature against the owner address embedded in
 * the raktbeej link, so a malicious gateway serving stale or forged content
 * is caught in the UI instead of trusted.
 *
 * Implemented in M2 against bee-js chunk primitives.
 */

/** Verify that raw SOC chunk bytes were signed by `owner`. */
export async function verifyFeedChunk(_owner: string, _chunkBytes: Uint8Array): Promise<boolean> {
  throw new Error('verifyFeedChunk: not implemented (M2)')
}
