/**
 * Drops: the interchangeable gateways a raktbeej link can be served
 * through. When a drop fails, the reader spills to the next.
 *
 * M2 implements the sequential contract pinned in M0 — drops tried in
 * order until one answers. Racing, health checks and the failover UI land
 * in M3.
 */

import { Bee, BeeResponseError } from '@ethersphere/bee-js'

export interface Drop {
  id: string
  /** Bee API origin serving the proxied endpoints (/chunks, /bytes, …). */
  origin: string
  /** true when the gateway serves content at `<ref>.<host>` subdomains. */
  subdomain: boolean
  dev?: boolean
}

export const DROPS: readonly Drop[] = [
  { id: 'bzz.link', origin: 'https://bzz.link', subdomain: true },
  { id: 'gateway', origin: 'https://api.gateway.ethswarm.org', subdomain: false },
  { id: 'bzz.limo', origin: 'https://bzz.limo', subdomain: true },
]

const DEV_DROP: Drop = {
  id: 'localhost',
  origin: 'http://localhost:1633',
  subdomain: false,
  dev: true,
}

/** Drops usable right now — the dev drop only when the page itself is local. */
export function activeDrops(): readonly Drop[] {
  const local =
    typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
  return local ? [DEV_DROP, ...DROPS] : DROPS
}

export interface Spilled<T> {
  drop: Drop
  value: T
}

function isMiss(err: unknown): boolean {
  return err instanceof BeeResponseError && err.status === 404
}

/**
 * Spill: run `task` against each drop in order until one resolves. If every
 * drop fails, rethrow the most serious error — a real fault beats a miss,
 * so "no drop has this chunk" is distinguishable from "drops are down".
 */
export async function spill<T>(task: (drop: Drop) => Promise<T>): Promise<Spilled<T>> {
  const errors: unknown[] = []
  for (const drop of activeDrops()) {
    try {
      return { drop, value: await task(drop) }
    } catch (err) {
      errors.push(err)
    }
  }
  const fault = errors.find((err) => !isMiss(err))
  throw fault ?? errors[errors.length - 1] ?? new Error('spill: no drops available')
}

const bees = new Map<string, Bee>()

/** Per-drop Bee client with a brisk timeout — a dead drop must not hang the reader. */
export function beeForDrop(drop: Drop): Bee {
  let bee = bees.get(drop.id)
  if (!bee) {
    bee = new Bee(drop.origin, { timeout: 10_000 })
    bees.set(drop.id, bee)
  }
  return bee
}
