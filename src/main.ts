import './style.css'

import { renderRead } from './routes/read'
import { renderPublish } from './routes/publish'

function route(): void {
  const app = document.querySelector<HTMLElement>('#app')
  if (!app) throw new Error('#app missing from index.html')

  app.replaceChildren()
  if (window.location.hash.startsWith('#/publish')) {
    app.append(renderPublish())
  } else {
    app.append(renderRead())
  }
}

window.addEventListener('hashchange', route)
route()
