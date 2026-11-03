/**
 * Reader route: mounts at any fragment that is not `#/publish`.
 *
 * Parses the raktbeej link from the fragment, walks the feed indices
 * across the drops, verifies each chunk's signature against the link's
 * owner, renders the manifest's posts, keeps a last-good offline cache,
 * and shows the raktbeej status panel: which drop served, whether the
 * content is ✓ signed, the feed index, and (from M4) the seed channel.
 */

import { h } from '../lib/dom'
import { loadCache, saveCache } from '../lib/cache'
import type { CachedPublication } from '../lib/cache'
import { downloadText, readLatestVerified } from '../lib/feed'
import { parseFragment } from '../lib/link'
import { parseManifest } from '../lib/protocol'
import { renderMarkdown } from '../lib/markdown'
import { VerificationRefused } from '../lib/verify'

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
  const seed = statusRow('seed channel')
  const statusPanel = h(
    'div',
    { class: 'status-panel' },
    drop.row,
    verified.row,
    index.row,
    seed.row,
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

  const paint = (publication: CachedPublication, state: 'cached' | 'live'): void => {
    posts.replaceChildren(...[...publication.posts].reverse().map(postCard))
    drop.value.textContent = publication.drop
    verified.value.textContent = `✓ signed by ${link.owner.slice(0, 10)}…`
    verified.value.classList.remove('refused')
    index.value.textContent = publication.index
    banner.classList.toggle('hidden', state === 'live')
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
      banner.classList.add('hidden')
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

  void refresh()
  return root
}
