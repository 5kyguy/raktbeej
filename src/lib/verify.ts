/**
 * Client-side verification of feed updates.
 *
 * A feed update is a single-owner chunk:
 *
 *   identifier = keccak256(topic || index)      (32 bytes)
 *   address    = keccak256(identifier || owner)  (where the chunk lives)
 *   chunk      = identifier || signature || span || payload
 *
 * The signature covers the identifier and the payload's content address;
 * recovering the signer from it must yield the owner embedded in the
 * raktbeej link. The reader verifies against that address — never against
 * anything a gateway claims — so forged or tampered bytes are refused no
 * matter which drop serves them.
 */

import { FeedIndex, Topic } from '@ethersphere/bee-js'
import {
  Bytes,
  Identifier,
  keccak256,
  makeSOCAddress,
  unmarshalSingleOwnerChunk,
} from '@ethersphere/core-sdk'
import type { SingleOwnerChunk } from '@ethersphere/core-sdk'
import type { Ref } from './protocol'

/** Feed chunk identifier for `topic` at `index`: keccak256(topic || index). */
export function makeFeedIdentifier(topic: string, index: FeedIndex): Identifier {
  return new Identifier(
    keccak256(Bytes.concat(Topic.fromString(topic).toUint8Array(), index.toUint8Array())),
  )
}

/** Address the feed chunk for `topic`/`index`/`owner` lives at. */
export function feedChunkAddress(topic: string, index: FeedIndex, owner: string): Ref {
  return makeSOCAddress(makeFeedIdentifier(topic, index), owner).toHex()
}

/**
 * Verify raw chunk bytes against the expected address. Returns the chunk
 * with its recovered owner; throws when the signature does not recover to
 * an owner whose address matches.
 */
export function verifySocChunk(bytes: Uint8Array, address: Ref): SingleOwnerChunk {
  return unmarshalSingleOwnerChunk(bytes, address)
}

/** Does this error mean bytes failed verification (tampered / forged)? */
export function isTamper(err: unknown): boolean {
  return err instanceof Error && /match given address/i.test(err.message)
}

/** Thrown when a drop served bytes that do not verify — refused, never rendered. */
export class VerificationRefused extends Error {
  constructor(address: Ref) {
    super(`refused: bytes served for ${address} do not verify against the link's owner`)
  }
}
