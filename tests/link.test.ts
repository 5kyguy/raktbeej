import { describe, expect, it } from 'vitest'

import { isRaktbeejLink, parseFragment, serializeFragment } from '../src/lib/link'

const OWNER = '0123456789abcdef0123456789abcdef01234567'

describe('parseFragment', () => {
  it('round-trips through serializeFragment', () => {
    const fragment = `#/f=${OWNER}&t=${encodeURIComponent('night dispatch')}`
    const link = parseFragment(fragment)
    expect(link).toEqual({ owner: OWNER, topic: 'night dispatch' })
    expect(serializeFragment(link!)).toBe(fragment)
  })

  it('canonicalizes owner case', () => {
    const link = parseFragment(`#/f=${OWNER.toUpperCase()}&t=dispatch`)
    expect(link?.owner).toBe(OWNER)
  })

  it('rejects a bad owner', () => {
    expect(parseFragment('#/f=deadbeef&t=dispatch')).toBeNull()
  })

  it('rejects a missing topic', () => {
    expect(parseFragment(`#/f=${OWNER}&t=`)).toBeNull()
  })

  it('rejects foreign fragments', () => {
    expect(parseFragment('#/publish')).toBeNull()
    expect(parseFragment('')).toBeNull()
  })
})

describe('isRaktbeejLink', () => {
  it('accepts a well-formed link', () => {
    expect(isRaktbeejLink({ owner: OWNER, topic: 'dispatch' })).toBe(true)
  })

  it('rejects garbage', () => {
    expect(isRaktbeejLink(null)).toBe(false)
    expect(isRaktbeejLink({ owner: 'nope', topic: 'x' })).toBe(false)
    expect(isRaktbeejLink({ owner: OWNER, topic: '' })).toBe(false)
  })
})
