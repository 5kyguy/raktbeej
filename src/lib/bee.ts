/**
 * Bee endpoint selection.
 *
 * The default write path is the public Swarm gateway with the null stamp
 * (anonymous free tier, verified live: `Access-Control-Allow-Origin: *`
 * on POST). Both fields are overridable from the publisher's advanced
 * settings — the paste-points for the plan's fallback chain:
 *
 *   1. gift-card stamp batch id (bought on the gateway with the event code)
 *   2. another gateway / beeport
 *   3. a local Bee node (http://localhost:1633 + own batch)
 */

import { Bee, NULL_STAMP, SWARM_GATEWAY_URL } from '@ethersphere/bee-js'

export interface Endpoint {
  /** Bee API base URL. */
  api: string
  /** Postage batch id, 64 hex chars. Zeros = gateway null stamp. */
  batchId: string
}

const STORAGE_KEY = 'raktbeej:endpoint'

export const DEFAULT_ENDPOINT: Endpoint = {
  api: SWARM_GATEWAY_URL,
  batchId: NULL_STAMP.toHex(),
}

export function getEndpoint(): Endpoint {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Endpoint>
      if (typeof parsed.api === 'string' && typeof parsed.batchId === 'string') {
        return { api: parsed.api, batchId: parsed.batchId }
      }
    }
  } catch {
    // unreadable override or no localStorage (node) — fall back to defaults
  }
  return DEFAULT_ENDPOINT
}

export function saveEndpoint(endpoint: Endpoint): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(endpoint))
}

let bee: Bee | null = null

/** Bee client for the configured endpoint. */
export function makeBee(): Bee {
  const { api } = getEndpoint()
  if (!bee || bee.url !== api) bee = new Bee(api)
  return bee
}
