import './style.css'

import { h } from './lib/dom'
import { renderRead } from './routes/read'
import { renderPublish } from './routes/publish'

/**
 * When the SPA is itself served from Swarm (…/bzz/<ref>/), it can read its
 * own immutable reference out of the path — the app pointing at the drop
 * that serves it.
 */
function selfRef(): string | null {
  const match = window.location.pathname.match(/\/bzz\/([0-9a-f]{64})/i)
  return match ? match[1] : null
}

function footer(): HTMLElement {
  const ref = selfRef()
  return h(
    'footer',
    { class: 'muted footer' },
    'raktbeej — every drop is a seed',
    ref
      ? h('span', {}, ' · this page is served from Swarm itself: ', h('code', {}, ref.slice(0, 16) + '…'))
      : ' · dev build',
  )
}

function route(): void {
  const app = document.querySelector<HTMLElement>('#app')
  if (!app) throw new Error('#app missing from index.html')

  app.replaceChildren()
  if (window.location.hash.startsWith('#/publish')) {
    app.append(renderPublish(), footer())
  } else {
    app.append(renderRead(), footer())
  }
}

window.addEventListener('hashchange', route)
route()
