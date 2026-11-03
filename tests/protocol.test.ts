import { describe, expect, it } from 'vitest'

import {
  buildNextPayload,
  encodeManifest,
  encodePayload,
  hashJson,
  isFeedPayload,
  isManifest,
  isSeed,
  parseManifest,
  parsePayload,
} from '../src/lib/protocol'
import type { FeedPayload, Manifest } from '../src/lib/protocol'

const REF = 'a'.repeat(64)

describe('protocol guards', () => {
  it('accepts a valid feed payload', () => {
    expect(isFeedPayload({ v: 1, ts: 1730000000000, prev: null, manifest: REF })).toBe(true)
    expect(isFeedPayload({ v: 1, ts: 1, prev: REF, manifest: REF })).toBe(true)
  })

  it('rejects a malformed feed payload', () => {
    expect(isFeedPayload({ v: 2, ts: 1, prev: null, manifest: REF })).toBe(false)
    expect(isFeedPayload({ v: 1, ts: 'soon', prev: null, manifest: REF })).toBe(false)
    expect(isFeedPayload({ v: 1, ts: 1, prev: null, manifest: 'nope' })).toBe(false)
  })

  it('accepts a valid manifest and seed', () => {
    expect(isManifest({ v: 1, posts: [{ title: 'first drop', ts: 1, ref: REF }] })).toBe(true)
    expect(isSeed({ type: 'seed', ts: 1, manifest: REF, index: 3 })).toBe(true)
  })

  it('rejects a malformed manifest and seed', () => {
    expect(isManifest({ v: 1, posts: [{ title: '', ts: 1, ref: REF }] })).toBe(false)
    expect(isSeed({ type: 'seed', ts: 1, manifest: REF })).toBe(false)
  })
})

describe('protocol encoding (M1)', () => {
  const payload: FeedPayload = { v: 1, ts: 1730000000000, prev: null, manifest: REF }

  it('encodes payloads in canonical fixed-key order', () => {
    expect(encodePayload(payload)).toBe(`{"v":1,"ts":1730000000000,"prev":null,"manifest":"${REF}"}`)
    expect(encodePayload({ ...payload, prev: REF })).toBe(
      `{"v":1,"ts":1730000000000,"prev":"${REF}","manifest":"${REF}"}`,
    )
  })

  it('hashes canonical json with keccak256 (known vector)', () => {
    expect(hashJson('')).toBe('c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470')
  })

  it('chains the first payload to null, later ones to the previous canonical bytes', () => {
    const first = buildNextPayload(null, REF, 5)
    expect(first).toEqual({ v: 1, ts: 5, prev: null, manifest: REF })
    const firstJson = encodePayload(first)
    const second = buildNextPayload({ json: firstJson }, 'b'.repeat(64), 6)
    expect(second.prev).toBe(hashJson(firstJson))
  })

  it('round-trips payloads and manifests through the parse guards', () => {
    expect(parsePayload(encodePayload(payload))).toEqual(payload)
    const manifest: Manifest = { v: 1, posts: [{ title: 'first drop', ts: 1, ref: REF }] }
    expect(parseManifest(encodeManifest(manifest))).toEqual(manifest)
    expect(() => parsePayload('{"v":2}')).toThrow()
  })
})
