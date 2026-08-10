import { Fragment, type ReactNode } from 'react'

// ================================================================
// A deliberately small Markdown renderer.
//
// It handles exactly the subset used by the documents in src/legal/,
// all of which we write ourselves. That is the whole reason it can be
// this short and this safe: there is no untrusted input, no raw HTML
// passthrough, and no dangerouslySetInnerHTML anywhere in it.
//
// If member-authored Markdown ever needs rendering, do not extend
// this — reach for a real parser with a sanitiser.
// ================================================================

/** Inline: **bold**, `code`, [text](url). Applied in that order. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*)|(`[^`]+`)|(\[[^\]]+\]\([^)]+\))/g

  let lastIndex = 0
  let match: RegExpExecArray | null
  let i = 0

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }

    const token = match[0]
    const key = `${keyPrefix}-i${i++}`

    if (token.startsWith('**')) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('`')) {
      nodes.push(
        <code key={key} className="rounded bg-gray-100 px-1 py-0.5 text-[0.9em] dark:bg-slate-700">
          {token.slice(1, -1)}
        </code>,
      )
    } else {
      const label = token.slice(1, token.indexOf(']'))
      const href = token.slice(token.indexOf('(') + 1, -1)
      const external = /^https?:\/\//.test(href)
      nodes.push(
        <a
          key={key}
          href={href}
          className="text-primary-600 underline hover:text-primary-700"
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {label}
        </a>,
      )
    }

    lastIndex = match.index + token.length
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes
}

const splitRow = (line: string) =>
  line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim())

export default function Markdown({ source }: { source: string }) {
  const lines = source.split('\n')
  const blocks: ReactNode[] = []

  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    // Blank
    if (!line.trim()) { i++; continue }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      blocks.push(<hr key={key++} className="my-8 border-gray-200 dark:border-slate-700" />)
      i++
      continue
    }

    // Headings
    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading) {
      const level = heading[1].length
      const content = inline(heading[2], `h${key}`)
      const cls = [
        'mt-2 mb-4 text-3xl font-bold tracking-tight',
        'mt-10 mb-3 text-2xl font-bold tracking-tight',
        'mt-8 mb-2 text-lg font-semibold',
        'mt-6 mb-2 text-base font-semibold',
      ][level - 1]

      const Tag = (['h1', 'h2', 'h3', 'h4'] as const)[level - 1]
      blocks.push(<Tag key={key++} className={cls}>{content}</Tag>)
      i++
      continue
    }

    // Table: a header row, a separator row, then body rows
    if (line.trim().startsWith('|') && lines[i + 1]?.includes('---')) {
      const header = splitRow(line)
      const rows: string[][] = []
      i += 2
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitRow(lines[i]))
        i++
      }

      blocks.push(
        <div key={key++} className="my-4 overflow-x-auto">
          <table className="w-full min-w-[24rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-300 dark:border-slate-600">
                {header.map((cell, c) => (
                  <th key={c} className="px-3 py-2 text-left font-semibold">
                    {inline(cell, `th${key}-${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r} className="border-b border-gray-200 dark:border-slate-700">
                  {row.map((cell, c) => (
                    <td key={c} className="px-3 py-2 align-top">
                      {inline(cell, `td${key}-${r}-${c}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    // Blockquote
    if (line.trimStart().startsWith('>')) {
      const quoted: string[] = []
      while (i < lines.length && lines[i].trimStart().startsWith('>')) {
        quoted.push(lines[i].replace(/^\s*>\s?/, ''))
        i++
      }
      blocks.push(
        <blockquote
          key={key++}
          className="my-4 rounded-r-xl border-l-4 border-warning-500 bg-warning-50 px-4 py-3 text-sm text-gray-800"
        >
          {quoted.filter(Boolean).map((q, n) => (
            <p key={n} className={n > 0 ? 'mt-2' : undefined}>{inline(q, `bq${key}-${n}`)}</p>
          ))}
        </blockquote>,
      )
      continue
    }

    // Lists — ordered and unordered, flat only
    const isBullet  = /^\s*[-*]\s+/.test(line)
    const isOrdered = /^\s*\d+\.\s+/.test(line)
    if (isBullet || isOrdered) {
      const items: string[] = []
      const test = isBullet ? /^\s*[-*]\s+/ : /^\s*\d+\.\s+/
      while (i < lines.length && test.test(lines[i])) {
        items.push(lines[i].replace(test, ''))
        i++
      }

      const ListTag = isOrdered ? 'ol' : 'ul'
      blocks.push(
        <ListTag
          key={key++}
          className={`my-3 space-y-1.5 pl-6 text-sm leading-relaxed ${
            isOrdered ? 'list-decimal' : 'list-disc'
          }`}
        >
          {items.map((item, n) => (
            <li key={n}>{inline(item, `li${key}-${n}`)}</li>
          ))}
        </ListTag>,
      )
      continue
    }

    // Paragraph — consume until a blank line or another block starts
    const para: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4}\s|---+$|\s*[-*]\s|\s*\d+\.\s|\||>)/.test(lines[i])
    ) {
      para.push(lines[i].trim())
      i++
    }

    if (para.length) {
      blocks.push(
        <p key={key++} className="my-3 text-sm leading-relaxed text-gray-700 dark:text-slate-300">
          {inline(para.join(' '), `p${key}`)}
        </p>,
      )
    } else {
      i++   // Defensive: never loop forever on a line we did not consume
    }
  }

  return <Fragment>{blocks}</Fragment>
}
