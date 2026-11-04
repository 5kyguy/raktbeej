/**
 * Publisher route: `#/publish`.
 *
 * Keyring — generate or import a dedicated key; it is kept in localStorage
 * on this device only and never sent anywhere. Editor — title + markdown.
 * Publish pipeline — post body and manifest uploads, then the signed feed
 * update, each step logged with its reference. Advanced — endpoint
 * overrides (the fallback paste-points: gift-card stamp batch id, another
 * gateway, or a local Bee node).
 */

import { getEndpoint, saveEndpoint } from '../lib/bee'
import { DEFAULT_ENDPOINT } from '../lib/bee'
import { h } from '../lib/dom'
import { generateKeyHex, ownerAddress, publishPost } from '../lib/feed'
import type { RaktbeejLink } from '../lib/link'
import { serializeFragment } from '../lib/link'
import { SeedChannel } from '../lib/seeds'

const KEY_STORAGE = 'raktbeej:key'
const TOPIC_STORAGE = 'raktbeej:topic'
const DEFAULT_TOPIC = 'fieldlog'

function loadKey(): string | null {
  return localStorage.getItem(KEY_STORAGE)
}

function loadTopic(): string {
  return localStorage.getItem(TOPIC_STORAGE) ?? DEFAULT_TOPIC
}

function linkFor(keyHex: string): RaktbeejLink {
  return { owner: ownerAddress(keyHex), topic: loadTopic() }
}

function copyButton(text: () => string): HTMLButtonElement {
  return h(
    'button',
    { class: 'secondary', onclick: () => void navigator.clipboard.writeText(text()) },
    'copy',
  )
}

function keyringSection(keyHex: string | null, onKey: (key: string | null) => void): HTMLElement {
  if (!keyHex) {
    const importInput = h('input', {
      type: 'password',
      placeholder: 'private key hex (0x… or 64 chars)',
      autocomplete: 'off',
    })
    return h(
      'section',
      { class: 'panel' },
      h('h2', {}, 'publisher key'),
      h(
        'p',
        { class: 'muted' },
        'a dedicated signing key, generated on this device and never sent anywhere. ',
        'never paste a key that holds funds.',
      ),
      h(
        'button',
        {
          onclick: () => {
            onKey(generateKeyHex())
          },
        },
        'generate publisher key',
      ),
      h('label', {}, 'or import an existing key'),
      h(
        'div',
        { class: 'row' },
        importInput,
        h(
          'button',
          {
            class: 'secondary',
            onclick: () => {
              const value = importInput.value.trim()
              if (value) onKey(value)
            },
          },
          'import',
        ),
      ),
    )
  }

  const owner = ownerAddress(keyHex)
  const fragment = h('span', {}, serializeFragment({ owner, topic: loadTopic() }))
  const topicInput = h('input', {
    type: 'text',
    value: loadTopic(),
    oninput: () => {
      const topic = topicInput.value.trim() || DEFAULT_TOPIC
      localStorage.setItem(TOPIC_STORAGE, topic)
      fragment.textContent = serializeFragment({ owner, topic })
    },
  })

  return h(
    'section',
    { class: 'panel' },
    h('h2', {}, 'publisher key'),
    h(
      'dl',
      { class: 'kv' },
      h('dt', {}, 'owner'),
      h('dd', {}, owner),
      h('dt', {}, 'topic'),
      h('dd', {}, topicInput),
      h('dt', {}, 'raktbeej link'),
      h('dd', {}, fragment, ' ', copyButton(() => fragment.textContent ?? '')),
    ),
    h(
      'button',
      {
        class: 'secondary',
        onclick: () => {
          if (confirm('forget the publisher key on this device?')) onKey(null)
        },
      },
      'forget key',
    ),
  )
}

function editorSection(keyHex: string | null): HTMLElement {
  const titleInput = h('input', { type: 'text', placeholder: 'title' })
  const body = h('textarea', { placeholder: 'markdown — every drop is a seed' })
  const log = h('ul', { class: 'log' })
  const result = h('div')
  const publish = h('button', { disabled: keyHex ? '' : 'disabled' }, 'publish drop')

  // the seed channel is kept across publishes; rebuilt if the topic moves
  let channel: { topic: string; seeds: SeedChannel } | null = null

  publish.addEventListener('click', () => {
    if (!keyHex) return
    const link = linkFor(keyHex)
    publish.disabled = true
    log.replaceChildren()
    result.replaceChildren()
    const line = (ok: boolean, text: string): void => {
      log.append(h('li', { class: ok ? 'ok' : 'err' }, text))
    }
    void (async () => {
      try {
        const r = await publishPost(keyHex, link, titleInput.value, body.value)
        line(true, `post uploaded · ${r.postRef}`)
        line(true, `manifest uploaded · ${r.manifestRef}`)
        line(true, `feed updated · index ${r.index} · prev ${r.payload.prev ?? 'null (first drop)'}`)

        if (!channel || channel.topic !== link.topic) {
          channel = { topic: link.topic, seeds: new SeedChannel(keyHex, link) }
        }
        const seeded = await channel.seeds.announce({
          type: 'seed',
          ts: r.payload.ts,
          manifest: r.manifestRef,
          index: r.index,
        })
        line(seeded, seeded ? 'seed sent — readers refresh instantly' : 'seed channel unavailable — readers poll (60s)')

        const linkText = serializeFragment(link)
        result.append(
          h(
            'p',
            { class: 'muted' },
            'share it: ',
            h('a', { href: linkText }, linkText),
            ' ',
            copyButton(() => linkText),
          ),
        )
      } catch (err) {
        line(false, err instanceof Error ? err.message : String(err))
      } finally {
        publish.disabled = false
      }
    })()
  })

  return h(
    'section',
    { class: 'panel' },
    h('h2', {}, 'new drop'),
    h('label', {}, 'title'),
    titleInput,
    h('label', {}, 'body'),
    body,
    publish,
    log,
    result,
  )
}

function advancedSection(): HTMLElement {
  const endpoint = getEndpoint()
  const apiInput = h('input', { type: 'text', value: endpoint.api })
  const batchInput = h('input', { type: 'text', value: endpoint.batchId })
  return h(
    'details',
    { class: 'advanced' },
    h('summary', {}, 'advanced — endpoint'),
    h('label', {}, `bee api (default ${DEFAULT_ENDPOINT.api})`),
    apiInput,
    h(
      'label',
      {},
      `postage batch id — zeros = gateway free tier (default ${DEFAULT_ENDPOINT.batchId})`,
    ),
    batchInput,
    h(
      'p',
      { class: 'muted' },
      'if free writes start failing: buy a stamp on the gateway (gift code → xBZZ) and paste its batch id here. ',
      'a local bee node works too (http://localhost:1633 + your own batch).',
    ),
    h(
      'button',
      {
        class: 'secondary',
        onclick: () => {
          saveEndpoint({
            api: apiInput.value.trim() || DEFAULT_ENDPOINT.api,
            batchId: batchInput.value.trim().toLowerCase() || DEFAULT_ENDPOINT.batchId,
          })
        },
      },
      'save endpoint',
    ),
  )
}

export function renderPublish(): HTMLElement {
  const root = h('main')

  const render = (): void => {
    root.replaceChildren(
      h('h1', {}, 'Raktbeej'),
      h('p', { class: 'muted' }, h('a', { href: '#/' }, '← reader'), ' publisher'),
      keyringSection(loadKey(), (next) => {
        if (next === null) localStorage.removeItem(KEY_STORAGE)
        else localStorage.setItem(KEY_STORAGE, next)
        render()
      }),
      editorSection(loadKey()),
      advancedSection(),
    )
  }

  render()
  return root
}
