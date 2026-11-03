import { describe, expect, it } from 'vitest'

import { isFeedPayload, isManifest, isSeed } from '../src/lib/protocol'

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
