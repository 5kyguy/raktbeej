/**
 * Drops: the interchangeable gateways a raktbeej link can be served
 * through. When a drop fails, the reader spills to the next.
 */

export interface Drop {
  id: string
  origin: string
  /** true when the gateway serves content at `<ref>.<host>` subdomains */
  subdomain: boolean
  dev?: boolean
}

export const DROPS: readonly Drop[] = [
  { id: 'bzz.link', origin: 'https://bzz.link', subdomain: true },
  { id: 'gateway.ethswarm.org', origin: 'https://gateway.ethswarm.org', subdomain: false },
  { id: 'bzz.limo', origin: 'https://bzz.limo', subdomain: true },
  { id: 'localhost', origin: 'http://localhost:1633', subdomain: false, dev: true },
]

export interface Spilled<T> {
  drop: Drop
  value: T
}

/**
 * Spill: run `task(drop)` against each drop in order until one resolves.
 * Racing and health checks land in M3; M0 pins the sequential contract.
 */
export async function spill<T>(_task: (drop: Drop) => Promise<T>): Promise<Spilled<T>> {
  throw new Error('spill: not implemented (M3)')
}
