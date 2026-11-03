import { describe, expect, it } from 'vitest'

import { FeedIndex, PrivateKey } from '@ethersphere/bee-js'
import { makeContentAddressedChunk, makeSingleOwnerChunk } from '@ethersphere/core-sdk'
import { Bytes } from '@ethersphere/core-sdk'

import { generateKeyHex, ownerAddress } from '../src/lib/feed'
import { feedChunkAddress, isTamper, makeFeedIdentifier, verifySocChunk } from '../src/lib/verify'

/** Build the exact bytes a Bee node stores for a feed update at `index`. */
function signFeedChunk(
  keyHex: string,
  topic: string,
  index: bigint,
  payloadJson: string,
): { data: Uint8Array; address: string } {
  const cac = makeContentAddressedChunk(Bytes.fromUtf8(payloadJson))
  const identifier = makeFeedIdentifier(topic, FeedIndex.fromBigInt(index))
  const soc = makeSingleOwnerChunk(cac, identifier, BigInt(`0x${keyHex}`))
  return { data: soc.data, address: soc.address.toHex() }
}

describe('feed chunk verification (M2)', () => {
  const keyHex = generateKeyHex()
  const owner = ownerAddress(keyHex)

  it('addresses chunks at keccak256(identifier || owner) for the right index', () => {
    const a = feedChunkAddress('fieldlog', FeedIndex.fromBigInt(0n), owner)
    const b = feedChunkAddress('fieldlog', FeedIndex.fromBigInt(1n), owner)
    const c = feedChunkAddress('other', FeedIndex.fromBigInt(0n), owner)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toBe(b)
    expect(a).not.toBe(c)
  })

  it('verifies a chunk signed by the owner and returns its payload', () => {
    const json = '{"v":1,"ts":5,"prev":null,"manifest":"' + 'a'.repeat(64) + '"}'
    const { data, address } = signFeedChunk(keyHex, 'fieldlog', 0n, json)
    expect(address).toBe(feedChunkAddress('fieldlog', FeedIndex.fromBigInt(0n), owner))
    expect(verifySocChunk(data, address).payload.toUtf8()).toBe(json)
  })

  it('refuses tampered bytes — a changed payload breaks the signature', () => {
    const { data, address } = signFeedChunk(keyHex, 'fieldlog', 0n, '{"v":1}')
    const tampered = Uint8Array.from(data)
    tampered[tampered.length - 3] ^= 0xff
    expect(() => verifySocChunk(tampered, address)).toThrow()
  })

  it('refuses chunks presented at the wrong address (forged location)', () => {
    const { data } = signFeedChunk(keyHex, 'fieldlog', 0n, '{"v":1}')
    const elsewhere = feedChunkAddress('fieldlog', FeedIndex.fromBigInt(9n), owner)
    expect(() => verifySocChunk(data, elsewhere)).toThrow()
  })

  it('refuses chunks signed by a different key', () => {
    const stranger = signFeedChunk(generateKeyHex(), 'fieldlog', 0n, '{"v":1}')
    const honestAddress = feedChunkAddress('fieldlog', FeedIndex.fromBigInt(0n), owner)
    expect(() => verifySocChunk(stranger.data, honestAddress)).toThrow()
  })

  it('classifies verification failures as tamper', () => {
    const { data, address } = signFeedChunk(keyHex, 'fieldlog', 0n, '{"v":1}')
    const tampered = Uint8Array.from(data)
    tampered[tampered.length - 1] ^= 0x01
    try {
      verifySocChunk(tampered, address)
      expect.unreachable('must throw')
    } catch (err) {
      expect(isTamper(err)).toBe(true)
    }
  })

  it('round-trips the publisher key used for signing', () => {
    expect(ownerAddress(keyHex)).toMatch(/^[0-9a-f]{40}$/)
    expect(() => new PrivateKey(keyHex).publicKey()).not.toThrow()
  })
})
