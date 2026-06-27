'use client'

import { useRef, useState, type RefObject } from 'react'
import type { WikipediaTarget } from '@/lib/wikipedia/types'
import WikipediaInsertDialog from './WikipediaInsertDialog'

interface Props {
  textareaRef: RefObject<HTMLTextAreaElement>
  value: string
  onChange: (value: string) => void
}

export function formatWikipediaEmbed(text: string, target: WikipediaTarget): string {
  const authorText = text || 'Текст вставки'
  const quote = authorText
    .split('\n')
    .map(line => (line ? `> ${line}` : '>'))
    .join('\n')
  return `${quote}\n>\n> [Wikipedia: ${target.title}](${target.articleUrl} "wikipedia")`
}

interface Tool {
  label: string
  text: string
  before: string
  after: string
  placeholder: string
  format?: (text: string) => string
}

const tools: Tool[] = [
  { label: 'Жирный', text: 'B', before: '**', after: '**', placeholder: 'жирный текст' },
  { label: 'Курсив', text: 'I', before: '*', after: '*', placeholder: 'курсив' },
  { label: 'Заголовок', text: 'H', before: '## ', after: '', placeholder: 'Заголовок' },
  { label: 'Цитата', text: '❝', before: '> ', after: '', placeholder: 'Цитата' },
  { label: 'Маркированный список', text: '•', before: '', after: '', placeholder: 'Пункт списка', format: formatUnorderedList },
  { label: 'Нумерованный список', text: '1.', before: '', after: '', placeholder: 'Пункт списка', format: formatOrderedList },
  { label: 'Сворачиваемый раздел', text: '▾', before: '\n<details>\n<summary>Заголовок раздела</summary>\n\n', after: '\n</details>', placeholder: 'Текст раздела' },
  { label: 'Ссылка', text: 'Link', before: '[', after: '](https://)', placeholder: 'текст ссылки' },
]

function formatUnorderedList(text: string): string {
  return text
    .split('\n')
    .map(line => line.trim() ? `- ${line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '')}` : line)
    .join('\n')
}

function formatOrderedList(text: string): string {
  let index = 1
  return text
    .split('\n')
    .map(line => {
      if (!line.trim()) return line
      const clean = line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '')
      return `${index++}. ${clean}`
    })
    .join('\n')
}

export default function MarkdownToolbar({ textareaRef, value, onChange }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const selectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 })

  function openWikipediaDialog() {
    const textarea = textareaRef.current
    selectionRef.current = {
      start: textarea?.selectionStart ?? value.length,
      end: textarea?.selectionEnd ?? value.length,
    }
    setDialogOpen(true)
  }

  function insertWikipedia(target: WikipediaTarget) {
    const { start, end } = selectionRef.current
    const selected = value.slice(start, end)
    const authorText = selected || 'Текст вставки'
    const block = formatWikipediaEmbed(selected, target)

    const before = value.slice(0, start)
    const after = value.slice(end)
    const leading = before ? (before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n') : ''
    const trailing = after ? (after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n') : ''

    onChange(`${before}${leading}${block}${trailing}${after}`)
    setDialogOpen(false)

    const authorStart = before.length + leading.length + 2 // skip the leading "> "
    const authorEnd = authorStart + authorText.length
    window.setTimeout(() => {
      const textarea = textareaRef.current
      textarea?.focus()
      textarea?.setSelectionRange(authorStart, authorEnd)
    }, 0)
  }

  function applyTool(tool: Tool) {
    const textarea = textareaRef.current
    const start = textarea?.selectionStart ?? value.length
    const end = textarea?.selectionEnd ?? value.length
    const selected = value.slice(start, end)
    const inner = tool.format ? tool.format(selected || tool.placeholder) : selected || tool.placeholder
    const next = `${value.slice(0, start)}${tool.before}${inner}${tool.after}${value.slice(end)}`
    onChange(next)

    window.setTimeout(() => {
      textarea?.focus()
      const cursorStart = start + tool.before.length
      const cursorEnd = cursorStart + inner.length
      textarea?.setSelectionRange(cursorStart, cursorEnd)
    }, 0)
  }

  return (
    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
      {tools.map(tool => (
        <button
          key={tool.label}
          type="button"
          aria-label={tool.label}
          onClick={() => applyTool(tool)}
          style={{
            minWidth: 30,
            height: 30,
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--text)',
            fontFamily: 'var(--nd-sans), system-ui, sans-serif',
            fontSize: '0.75rem',
            fontWeight: tool.text === 'B' ? 700 : 500,
            fontStyle: tool.text === 'I' ? 'italic' : 'normal',
            cursor: 'pointer',
          }}
        >
          {tool.text}
        </button>
      ))}
      <button
        type="button"
        aria-label="Вставка из Wikipedia"
        onClick={openWikipediaDialog}
        style={{
          minWidth: 30,
          height: 30,
          border: '1px solid var(--border)',
          background: 'var(--bg)',
          color: 'var(--text)',
          fontFamily: 'var(--nd-sans), system-ui, sans-serif',
          fontSize: '0.75rem',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        W
      </button>
      {dialogOpen && (
        <WikipediaInsertDialog onCancel={() => setDialogOpen(false)} onInsert={insertWikipedia} />
      )}
    </div>
  )
}
