/**
 * Seeds: the live layer.
 *
 * Publishing on Swarm is eventually consistent — a fresh feed update can
 * take a minute or more before every drop serves it. Seeds close that gap:
 * after each publish, the publisher announces the new manifest on a
 * swarm-pubsub channel (broker over libp2p, no local Bee node), and
 * readers refresh the moment one lands.
 *
 * The channel is owned by the publisher's own key, so every seed arrives
 * with unforgeable provenance (`message.publisher`). Still, a seed is only
 * a nudge: readers re-run the verified walk on arrival and render nothing
 * that does not verify. Polling (60s + tab focus) stays the fallback —
 * seeds accelerate, they never decide.
 *
 * swarm-pubsub is imported dynamically (libp2p is heavy; first paint stays
 * lean), the whole layer degrades to polling when the broker is down, and
 * `?seeds=off` forces that state for demos. `?broker=<multiaddr>` points
 * both sides at a different broker.
 */

import type { Broker, Publisher, Subscription } from 'swarm-pubsub'
import type { RaktbeejLink } from './link'
import { isSeed } from './protocol'
import type { Seed } from './protocol'

/** Public broker from the swarm-pubsub examples; override with ?broker=. */
export const DEFAULT_BROKER =
  '/dns4/broker.hiveway.xyz/tcp/443/tls/ws/p2p/QmSjaR7gK8jmVvU6kfH5n2vDj9yjDkN9rXCddtBcDdm844'

export type SeedChannelState = 'off' | 'connecting' | 'live' | 'down'

function queryFlag(name: string): string | null {
  if (typeof location === 'undefined') return null
  return new URLSearchParams(location.search).get(name)
}

export function brokerAddress(): string {
  return queryFlag('broker') ?? DEFAULT_BROKER
}

export function seedsDisabled(): boolean {
  return queryFlag('seeds') === 'off'
}

/** Pubsub channel topic for a link's seed stream. */
export function seedTopic(link: RaktbeejLink): string {
  return `raktbeej:seed:${link.topic}`
}

/** A seed message is valid when it parses, guards, and is signed by the feed owner. */
export function parseSeedMessage(text: string, publisher: string, owner: string): Seed | null {
  if (publisher !== owner) return null
  try {
    const value: unknown = JSON.parse(text)
    return isSeed(value) ? value : null
  } catch {
    return null
  }
}

export interface SeedEvents {
  onState(state: SeedChannelState, detail?: string): void
  onSeed(seed: Seed): void
}

export interface SeedListener {
  stop(): void
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Subscribe to the link's seed channel. Reconnects with backoff until
 * stopped; every state change surfaces through `onState`, every
 * owner-signed seed through `onSeed`.
 */
export function startSeedListener(link: RaktbeejLink, events: SeedEvents): SeedListener {
  let stopped = false
  let current: Broker | Subscription | undefined

  if (seedsDisabled()) {
    events.onState('off', '?seeds=off')
    return { stop: () => undefined }
  }

  const run = async (): Promise<void> => {
    let backoff = 3_000
    while (!stopped) {
      events.onState('connecting')
      try {
        const { connect } = await import('swarm-pubsub')
        const broker: Broker = await connect(brokerAddress())
        current = broker
        const subscription: Subscription = await broker.subscribe(link.owner, seedTopic(link), {
          onMessage: (message) => {
            const seed = parseSeedMessage(message.text(), message.publisher, link.owner)
            if (seed) {
              events.onState('live')
              events.onSeed(seed)
            }
          },
        })
        current = subscription
        events.onState('live')
        backoff = 3_000
        const closeEvent = await subscription.closed
        if (stopped) return
        if (closeEvent.ended) {
          events.onState('off', 'channel ended by the publisher')
          return
        }
        throw closeEvent.error ?? new Error('seed channel closed')
      } catch (err) {
        if (stopped) return
        events.onState('down', err instanceof Error ? err.message : String(err))
        await sleep(backoff)
        backoff = Math.min(backoff * 2, 60_000)
      }
    }
  }

  void run()
  return {
    stop: () => {
      stopped = true
      const open = current as { close?: () => void } | undefined
      try {
        open?.close?.()
      } catch {
        // already gone
      }
    },
  }
}

/**
 * The publisher's side of the seed channel: connects lazily on first
 * announce, stays open (the broker drops idle channels), and reports
 * failure as a plain false so callers can fall back silently.
 */
export class SeedChannel {
  private publisher?: Publisher
  private connecting?: Promise<Publisher | null>

  constructor(
    private readonly keyHex: string,
    private readonly link: RaktbeejLink,
  ) {}

  private ready(): Promise<Publisher | null> {
    if (seedsDisabled()) return Promise.resolve(null)
    if (this.publisher) return Promise.resolve(this.publisher)
    if (!this.connecting) {
      this.connecting = (async () => {
        try {
          const { connect } = await import('swarm-pubsub')
          const broker = await connect(brokerAddress())
          const publisher = await broker.publish(seedTopic(this.link), this.keyHex)
          void publisher.closed.then(() => {
            this.publisher = undefined
          })
          this.publisher = publisher
          return publisher
        } catch {
          this.connecting = undefined
          return null
        }
      })()
    }
    return this.connecting
  }

  /** Announce a seed. Resolves false when the channel is unavailable. */
  async announce(seed: Seed): Promise<boolean> {
    const publisher = await this.ready()
    if (!publisher) return false
    try {
      await publisher.send(JSON.stringify(seed))
      return true
    } catch {
      this.publisher = undefined
      return false
    }
  }
}
