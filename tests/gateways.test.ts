import { describe, expect, it } from 'vitest'

import { BeeResponseError } from '@ethersphere/bee-js'

import { contentUrl, dropLabel, parseDeadDrops, spill } from '../src/lib/gateways'
import { DROPS } from '../src/lib/gateways'

const miss = (): BeeResponseError => new BeeResponseError('GET', 'https://x/y', 'Not Found', {}, 404)
const fault = (): BeeResponseError =>
  new BeeResponseError('GET', 'https://x/y', 'Internal Server Error', {}, 500)

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

describe('drop bookkeeping (M3)', () => {
  it('parses the dead-drop demo flag', () => {
    expect(parseDeadDrops('')).toEqual([])
    expect(parseDeadDrops('?foo=1')).toEqual([])
    expect(parseDeadDrops('?dead=bzz.link')).toEqual(['bzz.link'])
    expect(parseDeadDrops('?dead=bzz.link,gateway')).toEqual(['bzz.link', 'gateway'])
    expect(parseDeadDrops('?dead=,,bzz.limo,')).toEqual(['bzz.limo'])
  })

  it('labels drops by position and builds per-drop content urls', () => {
    expect(dropLabel(DROPS[0])).toBe('drop 1 · bzz.link')
    expect(dropLabel(DROPS[1])).toBe('drop 2 · gateway')
    const ref = 'a'.repeat(64)
    expect(contentUrl(DROPS[0], ref)).toBe(`https://bzz.link/bytes/${ref}`)
    expect(contentUrl(DROPS[1], ref)).toBe(`https://api.gateway.ethswarm.org/bytes/${ref}`)
  })
})

describe('spill — hedged racing (M3)', () => {
  it('waits for the first drop to produce the content', async () => {
    const result = await spill(async (drop) => {
      if (drop.id === 'bzz.link') await sleep(30)
      return `from ${drop.id}`
    })
    expect(result.drop.id).toBe('bzz.link')
    expect(result.value).toBe('from bzz.link')
  })

  it('lets a later drop win when the first stalls', async () => {
    const result = await spill(
      async (drop) => {
        if (drop.id === 'bzz.link') await sleep(400)
        return `from ${drop.id}`
      },
      { stagger: 40 },
    )
    expect(result.value).toBe('from gateway')
  })

  it('pulls the next drop in immediately on a miss, ignoring the stagger', async () => {
    const result = await spill(
      async (drop) => {
        if (drop.id === 'bzz.link') throw miss()
        return `from ${drop.id}`
      },
      { stagger: 10_000 },
    )
    expect(result.drop.id).toBe('gateway')
  })

  it('throws the miss when every drop misses', async () => {
    await expect(
      spill(async () => {
        throw miss()
      }),
    ).rejects.toBeInstanceOf(BeeResponseError)
  })

  it('ranks a real fault over a miss when all drops fail', async () => {
    const error = fault()
    await expect(
      spill(async (drop) => {
        if (drop.id === 'bzz.link') throw miss()
        if (drop.id === 'gateway') throw error
        throw miss()
      }),
    ).rejects.toBe(error)
  })

  it('aborts the stragglers once a drop wins', async () => {
    let loserSignal: AbortSignal | undefined
    const result = await spill(
      async (drop, signal) => {
        if (drop.id === 'gateway') {
          loserSignal = signal
          await sleep(120)
          return 'slow'
        }
        await sleep(10)
        return 'fast'
      },
      { stagger: 5 },
    )
    expect(result.value).toBe('fast')
    expect(loserSignal?.aborted).toBe(true)
  })
})
