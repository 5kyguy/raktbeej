import { describe, expect, it } from 'vitest'

import { parseMarkdown } from '../src/lib/markdown'

describe('markdown parsing (M2)', () => {
  it('splits paragraphs on blank lines and keeps single newlines', () => {
    const blocks = parseMarkdown('first\nline\n\nsecond')
    expect(blocks).toHaveLength(2)
    expect(blocks[0].kind).toBe('p')
    expect(blocks[1].spans[0]).toEqual({ t: 'text', text: 'second' })
  })

  it('maps headings by level', () => {
    const blocks = parseMarkdown('# one\n## two\n### three')
    expect(blocks.map((b) => b.kind)).toEqual(['h2', 'h3', 'h4'])
  })

  it('parses the inline constructs it supports', () => {
    const [block] = parseMarkdown(
      'plain `code` **bold** *italic* [label](https://example.com/x) tail',
    )
    expect(block.spans).toEqual([
      { t: 'text', text: 'plain ' },
      { t: 'code', text: 'code' },
      { t: 'text', text: ' ' },
      { t: 'bold', text: 'bold' },
      { t: 'text', text: ' ' },
      { t: 'italic', text: 'italic' },
      { t: 'text', text: ' ' },
      { t: 'link', text: 'label', href: 'https://example.com/x' },
      { t: 'text', text: ' tail' },
    ])
  })

  it('treats html-looking input as plain text — nothing is ever markup', () => {
    const [block] = parseMarkdown('<script>alert(1)</script> **not bold**')
    expect(block.spans[0]).toEqual({ t: 'text', text: '<script>alert(1)</script> ' })
    expect(block.spans[1]).toEqual({ t: 'bold', text: 'not bold' })
  })

  it('rejects non-http link targets as links', () => {
    const [block] = parseMarkdown('[x](javascript:alert(1))')
    expect(block.spans.every((s) => s.t === 'text')).toBe(true)
  })
})
