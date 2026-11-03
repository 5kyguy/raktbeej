/**
 * The Raktbeej link codec.
 *
 * A raktbeej link carries the identity of a publication in the URL fragment:
 *
 *   #/f=<owner>&t=<topic>
 *
 * `owner` is the 20-byte address (40 hex chars, no 0x prefix) of the feed
 * owner key. `topic` is the feed topic name. Because the identity lives in
 * the fragment, it is never sent to any server: any gateway can serve the
 * reader, and the link survives the death of any particular host.
 */

export interface RaktbeejLink {
  /** 20-byte address of the feed owner, 40 hex chars, no 0x prefix. */
  owner: string
  /** Feed topic name, 1-64 utf-8 characters. */
  topic: string
}

const FRAGMENT_PREFIX = '#/'
const OWNER_RE = /^[0-9a-f]{40}$/
const TOPIC_MAX = 64

export function isRaktbeejLink(value: unknown): value is RaktbeejLink {
  if (typeof value !== 'object' || value === null) return false
  const { owner, topic } = value as Record<string, unknown>
  if (typeof owner !== 'string' || typeof topic !== 'string') return false
  return OWNER_RE.test(owner) && topic.length > 0 && topic.length <= TOPIC_MAX
}

/** Parse `#/f=<owner>&t=<topic>` into a link. Returns null when malformed. */
export function parseFragment(hash: string): RaktbeejLink | null {
  if (!hash.startsWith(FRAGMENT_PREFIX)) return null
  const params = new URLSearchParams(hash.slice(FRAGMENT_PREFIX.length))
  const owner = (params.get('f') ?? '').toLowerCase()
  const topic = params.get('t') ?? ''
  const link: RaktbeejLink = { owner, topic }
  return isRaktbeejLink(link) ? link : null
}

/** Serialize a link back into its fragment form. */
export function serializeFragment(link: RaktbeejLink): string {
  if (!isRaktbeejLink(link)) {
    throw new Error(`not a raktbeej link: ${JSON.stringify(link)}`)
  }
  return `${FRAGMENT_PREFIX}f=${link.owner}&t=${encodeURIComponent(link.topic)}`
}
