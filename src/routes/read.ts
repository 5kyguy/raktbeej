/**
 * Reader route: mounts at any fragment that is not `#/publish`.
 *
 * Parses the raktbeej link from the fragment, walks the feed indices
 * across the drops (racing — a stalled drop is spilled past), verifies
 * each chunk's signature against the link's owner, renders the manifest's
 * posts, keeps a last-good offline cache, and shows the raktbeej status
 * panel: which drop served and whether it had to spill, ✓ signed, the
 * feed index, where else the content opens, the block-a-drop demo, and
 * (from M4) the seed channel.
 */

import { h } from '../lib/dom'
import { loadCache, saveCache } from '../lib/cache'
import type { CachedPublication } from '../lib/cache'
import { downloadText, readLatestVerified } from '../lib/feed'
import { DROPS, activeDrops, contentUrl, deadDrops, dropLabel } from '../lib/gateways'
import type { Drop } from '../lib/gateways'
import { parseFragment } from '../lib/link'
import { parseManifest } from '../lib/protocol'
import { renderMarkdown } from '../lib/markdown'
import { startSeedListener } from '../lib/seeds'
import type { SeedChannelState } from '../lib/seeds'
import { VerificationRefused } from '../lib/verify'

const SEED_LABEL: Record<SeedChannelState, string> = {
  off: 'off',
  connecting: 'connecting…',
  live: 'live ✓',
  down: 'down — polling (60s)',
}

function statusRow(label: string): { row: HTMLElement; value: HTMLElement } {
  const value = h('span', { class: 'status-value' })
  const row = h(
    'span',
    { class: 'status-row' },
    h('span', { class: 'status-label' }, label),
    value,
  )
  return { row, value }
}

function timeAt(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** "drop 2 · gateway — spilled" when the winner is not the first live drop. */
function servedFrom(drop: Drop): string {
  const live = activeDrops()
  return live[0]?.id === drop.id ? dropLabel(drop) : `${dropLabel(drop)} — spilled`
}

/** Block-a-drop demo: rewrite ?dead=… and reload (hash untouched). */
function blockDemoRow(): { row: HTMLElement; value: HTMLElement } {
  const select = document.createElement('select')
  const choices: Array<{ label: string; value: string }> = [
    { label: '—', value: '' },
    ...DROPS.map((d) => ({ label: d.id, value: d.id })),
    { label: 'bzz.link + gateway', value: 'bzz.link,gateway' },
  ]
  for (const choice of choices) {
    const option = document.createElement('option')
    option.value = choice.value
    option.textContent = choice.label
    select.append(option)
  }
  select.value = deadDrops().join(',')
  select.addEventListener('change', () => {
    const url = new URL(window.location.href)
    if (select.value) url.searchParams.set('dead', select.value)
    else url.searchParams.delete('dead')
    window.location.assign(url.toString())
  })
  const value = h('span', { class: 'status-value' }, select)
  const row = h(
    'span',
    { class: 'status-row' },
    h('span', { class: 'status-label' }, 'block a drop (demo)'),
    value,
  )
  return { row, value }
}

function postCard(entry: { title: string; ts: number; body?: string }): HTMLElement {
  const body = h('div', { class: 'post-body' })
  if (entry.body !== undefined) body.append(...renderMarkdown(entry.body))
  return h(
    'article',
    { class: 'post' },
    h('h2', {}, entry.title),
    h('time', { class: 'muted' }, new Date(entry.ts).toISOString().slice(0, 16).replace('T', ' ')),
    body,
  )
}

function intro(): HTMLElement {
  return h(
    'div',
    { class: 'panel' },
    h('h2', {}, 'no raktbeej link in this url'),
    h(
      'p',
      { class: 'muted' },
      'a raktbeej link carries a publication in its fragment — ',
      h('code', {}, '#/f=<owner>&t=<topic>'),
      ' — so the identity never touches a server. any gateway can serve it; ',
      'every copy is verified against the owner key.',
    ),
    h('p', { class: 'muted' }, h('a', { href: '#/publish' }, 'publish the first drop →')),
  )
}

export function renderRead(): HTMLElement {
  const link = parseFragment(window.location.hash)
  const root = h('main')

  if (!link) {
    root.append(h('h1', {}, 'Raktbeej'), h('p', { class: 'muted' }, 'reader'), intro())
    return root
  }

  const drop = statusRow('drop')
  const verified = statusRow('verified')
  const index = statusRow('index')
  const openOn = statusRow('open on')
  const seed = statusRow('seed channel')
  const blockDemo = blockDemoRow()
  const statusPanel = h(
    'div',
    { class: 'status-panel' },
    drop.row,
    verified.row,
    index.row,
    openOn.row,
    seed.row,
    blockDemo.row,
  )

  const banner = h('p', { class: 'banner hidden' })
  const posts = h('div')
  const shareNote = h('span', { class: 'muted' })
  const share = h(
    'button',
    {
      class: 'secondary',
      onclick: () => {
        void navigator.clipboard.writeText(`${location.origin}${location.pathname}${location.hash}`)
        shareNote.textContent = 'copied ✓'
        setTimeout(() => (shareNote.textContent = ''), 1500)
      },
    },
    'share this link',
  )

  const header = h(
    'header',
    {},
    h('h1', {}, 'Raktbeej'),
    h(
      'p',
      { class: 'muted' },
      `"${link.topic}" · by ${link.owner.slice(0, 10)}… `,
      h('a', { href: '#/publish' }, 'publish'),
    ),
  )

  root.append(header, statusPanel, banner, posts, h('div', { class: 'row' }, share, shareNote))

  const byId = (id: string): Drop | undefined => DROPS.find((d) => d.id === id)
  const blocked = deadDrops()

  const paint = (publication: CachedPublication, state: 'cached' | 'live'): void => {
    posts.replaceChildren(...[...publication.posts].reverse().map(postCard))
    drop.value.textContent = byId(publication.drop)
      ? servedFrom(byId(publication.drop)!)
      : publication.drop
    verified.value.textContent = `✓ signed by ${link.owner.slice(0, 10)}…`
    verified.value.classList.remove('refused')
    index.value.textContent = publication.index
    const showBanner = state === 'cached' || blocked.length > 0
    banner.classList.toggle('hidden', !showBanner)
    if (state === 'cached') {
      banner.className = 'banner'
      banner.textContent = `offline copy — verified at ${timeAt(publication.savedAt)}, refreshing…`
    }
  }

  const refresh = async (): Promise<void> => {
    const cached = loadCache(link)
    if (cached) paint(cached, 'cached')
    else {
      verified.value.textContent = '…'
      banner.className = 'banner'
      banner.textContent = 'fetching from the drops…'
    }

    if (blocked.length > 0) {
      banner.className = 'banner'
      banner.textContent = `demo: ${blocked.join(', ')} blocked — the reader spills past it`
    }

    try {
      const from = cached ? BigInt(cached.index) : 0n
      const latest =
        (from === 0n ? null : await readLatestVerified(link, { from })) ??
        (await readLatestVerified(link))

      if (!latest) {
        banner.className = 'banner'
        banner.textContent = 'feed exists, no updates yet'
        verified.value.textContent = '—'
        return
      }

      const manifestJson = await downloadText(latest.payload.manifest)
      const manifest = parseManifest(manifestJson.value)
      const entries = await Promise.all(
        manifest.posts.map(async (post) => {
          let body: string | undefined
          try {
            body = (await downloadText(post.ref)).value
          } catch {
            // a drop lost a post body — the entry still renders
          }
          return { ...post, body }
        }),
      )

      openOn.value.replaceChildren(
        ...activeDrops().map((d, i) =>
          h('span', {}, i > 0 ? ' · ' : '', h('a', {
            href: contentUrl(d, latest.payload.manifest),
            target: '_blank',
            rel: 'noopener noreferrer',
          }, d.id)),
        ),
      )

      const publication: CachedPublication = {
        savedAt: Date.now(),
        index: String(latest.index),
        drop: latest.drop.id,
        payload: latest.payload,
        manifest,
        posts: entries,
      }
      saveCache(link, publication)
      paint(publication, 'live')
      if (blocked.length > 0) {
        banner.className = 'banner'
        banner.textContent = `demo: ${blocked.join(', ')} blocked — served by ${servedFrom(latest.drop)}`
      }
    } catch (err) {
      if (err instanceof VerificationRefused) {
        posts.replaceChildren()
        banner.className = 'banner refused'
        banner.textContent = err.message
        verified.value.textContent = `✗ refused`
        verified.value.classList.add('refused')
        drop.value.textContent = '—'
        index.value.textContent = '—'
        return
      }
      if (cached) {
        banner.className = 'banner'
        banner.textContent = `every drop failed — showing the offline copy verified at ${timeAt(cached.savedAt)}`
      } else {
        banner.className = 'banner refused'
        banner.textContent = `every drop failed: ${err instanceof Error ? err.message : String(err)}`
      }
    }
  }

  let refreshing = false
  let lastSeedRefresh = 0

  const guardedRefresh = async (): Promise<void> => {
    if (refreshing) return
    refreshing = true
    try {
      await refresh()
    } finally {
      refreshing = false
    }
  }

  void guardedRefresh()

  // the live layer: seeds nudge an immediate verified refresh; polling is
  // the designed fallback (60s + whenever the tab regains focus)
  const seedListener = startSeedListener(link, {
    onState: (state, detail) => {
      seed.value.textContent = SEED_LABEL[state]
      if (state === 'down' && detail) seed.value.title = detail
      seed.value.classList.toggle('live', state === 'live')
    },
    onSeed: (arrived) => {
      seed.value.textContent = `live · seed ${timeAt(arrived.ts)}`
      seed.value.classList.add('live')
      const now = Date.now()
      if (now - lastSeedRefresh >= 2_000) {
        lastSeedRefresh = now
        void guardedRefresh()
      }
    },
  })

  const poll = setInterval(() => {
    if (document.visibilityState === 'visible') void guardedRefresh()
  }, 60_000)
  const onFocus = (): void => void guardedRefresh()
  window.addEventListener('focus', onFocus)
  window.addEventListener(
    'hashchange',
    () => {
      clearInterval(poll)
      window.removeEventListener('focus', onFocus)
      seedListener.stop()
    },
    { once: true },
  )

  return root
}
