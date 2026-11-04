/**
 * Drops: the interchangeable gateways a raktbeej link can be served
 * through. When a drop fails or stalls, the reader spills to the next.
 *
 * M3: requests are hedged — drop 1 goes first, and if it has not answered
 * within `stagger` ms the next drop joins the race; the first drop to
 * produce the content wins and the stragglers are aborted. A miss (404)
 * knocks only that drop out of the current race and immediately invites
 * the next one in.
 *
 * `?dead=<id>,<id>` in the query string blocks drops for the session —
 * the demo flag that makes a takedown rehearstable without touching the
 * network.
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

/** Parse `?dead=a,b` — pure, for tests. */
export function parseDeadDrops(search: string): string[] {
  const dead = new URLSearchParams(search).get('dead')
  if (!dead) return []
  return dead
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
}

/** Drops blocked by the demo flag for this page load. */
export function deadDrops(): string[] {
  return typeof location !== 'undefined' ? parseDeadDrops(location.search) : []
}

/** Drops usable right now — dev drop only when the page is local, minus blocked ones. */
export function activeDrops(): readonly Drop[] {
  const local =
    typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
  const all = local ? [DEV_DROP, ...DROPS] : DROPS
  const dead = new Set(deadDrops())
  return all.filter((drop) => !dead.has(drop.id))
}

export interface Spilled<T> {
  drop: Drop
  value: T
}

function isMiss(err: unknown): boolean {
  return err instanceof BeeResponseError && err.status === 404
}

export interface SpillOptions {
  /** ms a drop may hog the race before the next one joins (default 750). */
  stagger?: number
}

/**
 * Spill: hedged race across the active drops. `task` runs against drop 1;
 * while it stalls, later drops join after `stagger` ms each; a miss (404)
 * pulls the next drop in immediately. The first drop to produce a value
 * wins and aborts the stragglers. If no drop produces one, the most
 * serious error wins the throw — a real fault beats a miss, so "no drop
 * has this chunk" stays distinguishable from "the drops are down".
 */
export async function spill<T>(
  task: (drop: Drop, signal: AbortSignal) => Promise<T>,
  options?: SpillOptions,
): Promise<Spilled<T>> {
  const drops = activeDrops()
  const stagger = options?.stagger ?? 750
  if (drops.length === 0) throw new Error('spill: every drop is blocked (?dead=…)')

  return new Promise<Spilled<T>>((resolve, reject) => {
    const losers = new AbortController()
    let launched = 0
    let pending = 0
    let done = false
    let fault: unknown
    let miss: unknown

    const finish = (): void => {
      if (done) return
      done = true
      losers.abort()
      reject(fault ?? miss ?? new Error('spill: no drop answered'))
    }

    const launchNext = (): void => {
      if (done || launched >= drops.length) return
      const drop = drops[launched++]
      pending++
      task(drop, losers.signal).then(
        (value) => {
          if (done) return
          done = true
          losers.abort()
          resolve({ drop, value })
        },
        (err) => {
          if (done) return
          pending--
          if (isMiss(err)) {
            if (miss === undefined) miss = err
            // a miss means this drop cannot serve *this* request — no reason
            // to let the stagger delay the next one
            launchNext()
          } else if (fault === undefined) {
            fault = err
          }
          if (pending === 0 && launched === drops.length) finish()
        },
      )
      if (launched < drops.length) {
        setTimeout(() => launchNext(), stagger)
      }
    }

    launchNext()
  })
}

/** Human label for a drop's position: "drop 1 · bzz.link". */
export function dropLabel(drop: Drop): string {
  const n = DROPS.findIndex((d) => d.id === drop.id) + 1
  return n > 0 ? `drop ${n} · ${drop.id}` : drop.id
}

/** URL that opens immutable content `ref` on `drop` — verified live on every drop. */
export function contentUrl(drop: Drop, ref: string): string {
  return `${drop.origin}/bytes/${ref}`
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
