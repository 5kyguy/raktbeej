/**
 * Publisher route: `#/publish`. Editor, keyring, and publish pipeline
 * arrive in M1.
 */

export function renderPublish(): HTMLElement {
  const root = document.createElement('main')
  root.className = 'publisher'

  const title = document.createElement('h1')
  title.textContent = 'Raktbeej'

  const subtitle = document.createElement('p')
  subtitle.className = 'muted'
  subtitle.textContent = 'publisher — arrives in M1'

  const back = document.createElement('a')
  back.href = '#/'
  back.textContent = '← reader'

  root.append(title, subtitle, back)
  return root
}
