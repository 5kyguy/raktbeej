/**
 * Reader route: mounts at any fragment that is not `#/publish`.
 * Renders the publication and the Raktbeej status panel (M2 fills both).
 */

import { parseFragment } from '../lib/link'

function statusRow(label: string, value: string): HTMLElement {
  const row = document.createElement('span')
  row.className = 'status-row'

  const name = document.createElement('span')
  name.className = 'status-label'
  name.textContent = label

  const val = document.createElement('span')
  val.className = 'status-value'
  val.textContent = value

  row.append(name, val)
  return row
}

export function renderRead(): HTMLElement {
  const root = document.createElement('main')
  root.className = 'reader'

  const link = parseFragment(window.location.hash)

  const title = document.createElement('h1')
  title.textContent = 'Raktbeej'

  const subtitle = document.createElement('p')
  subtitle.className = 'muted'
  subtitle.textContent = link
    ? `reading "${link.topic}" by ${link.owner.slice(0, 8)}…`
    : 'no raktbeej link in this URL yet (reader arrives in M2)'

  const status = document.createElement('div')
  status.className = 'status-panel'
  status.append(
    statusRow('drop', '—'),
    statusRow('verified', '—'),
    statusRow('index', '—'),
    statusRow('seed channel', '—'),
  )

  root.append(title, subtitle, status)
  return root
}
