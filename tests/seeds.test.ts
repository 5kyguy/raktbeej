import { describe, expect, it } from 'vitest'

import type { RaktbeejLink } from '../src/lib/link'
import { encodeSeed } from '../src/lib/protocol'
import { brokerAddress, parseSeedMessage, seedTopic, seedsDisabled } from '../src/lib/seeds'

const REF = 'a'.repeat(64)

describe('seed messages (M4)', () => {
  const link: RaktbeejLink = { owner: 'a'.repeat(40), topic: 'fieldlog' }

  it('names the pubsub channel after the link', () => {
    expect(seedTopic(link)).toBe('raktbeej:seed:fieldlog')
  })

  it('accepts a canonical seed from the feed owner', () => {
    const seed = { type: 'seed' as const, ts: 5, manifest: REF, index: 3 }
    const text = encodeSeed(seed)
    expect(parseSeedMessage(text, link.owner, link.owner)).toEqual(seed)
  })

  it('refuses seeds from anyone but the feed owner', () => {
    const text = encodeSeed({ type: 'seed', ts: 5, manifest: REF, index: 3 })
    expect(parseSeedMessage(text, 'b'.repeat(40), link.owner)).toBeNull()
  })

  it('refuses malformed payloads', () => {
    expect(parseSeedMessage('not json', link.owner, link.owner)).toBeNull()
    expect(parseSeedMessage('{"type":"seed"}', link.owner, link.owner)).toBeNull()
    expect(parseSeedMessage('{"type":"seed","ts":"x","manifest":"nope","index":1}', link.owner, link.owner)).toBeNull()
  })

  it('defaults the broker and keeps seeds enabled without overrides (node: no query string)', () => {
    expect(seedsDisabled()).toBe(false)
    expect(brokerAddress()).toContain('broker.hiveway.xyz')
  })
})
