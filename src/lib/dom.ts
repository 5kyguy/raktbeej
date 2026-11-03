/** Minimal DOM helper — no framework, one `h()` for everything. */

type Child = Node | string | null | undefined | false

type Attrs = Record<string, string | EventListener>

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [name, value] of Object.entries(attrs)) {
    if (typeof value === 'function') {
      node.addEventListener(name.slice(2), value as EventListener)
    } else if (name === 'value') {
      // set via property so inputs pick up programmatic changes correctly
      ;(node as unknown as HTMLInputElement).value = value
    } else {
      node.setAttribute(name, value)
    }
  }
  for (const child of children) {
    if (child == null || child === false) continue
    node.append(child instanceof Node ? child : document.createTextNode(child))
  }
  return node
}
