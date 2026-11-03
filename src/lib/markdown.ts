/**
 * Minimal markdown renderer — posts are plain text with a few constructs.
 * Parsing is pure (testable without a DOM); rendering builds DOM from the
 * parsed spans, and everything passes through textContent, so a post can
 * never inject HTML.
 */

export type Span =
  | { t: 'text'; text: string }
  | { t: 'code'; text: string }
  | { t: 'bold'; text: string }
  | { t: 'italic'; text: string }
  | { t: 'link'; text: string; href: string }

export type Block = { kind: 'p' | 'h2' | 'h3' | 'h4'; spans: Span[] }

const INLINE_RE =
  /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/g

function parseInline(text: string): Span[] {
  const spans: Span[] = []
  let at = 0
  for (const match of text.matchAll(INLINE_RE)) {
    const start = match.index ?? 0
    if (start > at) spans.push({ t: 'text', text: text.slice(at, start) })
    const token = match[0]
    if (token.startsWith('`')) spans.push({ t: 'code', text: token.slice(1, -1) })
    else if (token.startsWith('**')) spans.push({ t: 'bold', text: token.slice(2, -2) })
    else if (token.startsWith('*')) spans.push({ t: 'italic', text: token.slice(1, -1) })
    else {
      const sep = token.indexOf('](')
      spans.push({ t: 'link', text: token.slice(1, sep), href: token.slice(sep + 2, -1) })
    }
    at = start + token.length
  }
  if (at < text.length) spans.push({ t: 'text', text: text.slice(at) })
  return spans
}

/** Parse markdown into blocks. Headings (`#`–`###`) break paragraphs; blank lines split them. */
export function parseMarkdown(md: string): Block[] {
  const blocks: Block[] = []
  const lines: string[] = []

  const flush = (): void => {
    if (lines.length) {
      blocks.push({ kind: 'p', spans: lines.flatMap(parseInline) })
      lines.length = 0
    }
  }

  for (const raw of md.replace(/\r\n/g, '\n').split('\n')) {
    const heading = /^(#{1,3})\s+(.*)$/.exec(raw)
    if (heading) {
      flush()
      const kind = (['h2', 'h3', 'h4'] as const)[heading[1].length - 1]
      blocks.push({ kind, spans: parseInline(heading[2]) })
      continue
    }
    if (!raw.trim()) {
      flush()
      continue
    }
    lines.push(raw)
  }
  flush()
  return blocks
}

function buildSpan(span: Span, doc: Document): HTMLElement | string {
  switch (span.t) {
    case 'code':
      return Object.assign(doc.createElement('code'), { textContent: span.text })
    case 'bold':
      return Object.assign(doc.createElement('strong'), { textContent: span.text })
    case 'italic':
      return Object.assign(doc.createElement('em'), { textContent: span.text })
    case 'link': {
      const a = doc.createElement('a')
      a.href = span.href
      a.target = '_blank'
      a.rel = 'noopener noreferrer nofollow'
      a.textContent = span.text
      return a
    }
    default:
      return span.text
  }
}

/** Render markdown into DOM elements. Browser only. */
export function renderMarkdown(md: string): HTMLElement[] {
  return parseMarkdown(md).map((block) => {
    const el = document.createElement(block.kind)
    el.append(...block.spans.map((span) => buildSpan(span, document)))
    return el
  })
}
