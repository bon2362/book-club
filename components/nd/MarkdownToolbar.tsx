'use client'

import { useRef, useState, type RefObject } from 'react'
import type { WikipediaTarget } from '@/lib/wikipedia/types'
import WikipediaInsertDialog from './WikipediaInsertDialog'

interface Props {
  textareaRef: RefObject<HTMLTextAreaElement>
  value: string
  onChange: (value: string) => void
}

interface TextareaSelection {
  start: number
  end: number
  scrollTop: number
  scrollLeft: number
}

function readTextareaSelection(textarea: HTMLTextAreaElement | null, fallback: number): TextareaSelection {
  return {
    start: textarea?.selectionStart ?? fallback,
    end: textarea?.selectionEnd ?? fallback,
    scrollTop: textarea?.scrollTop ?? 0,
    scrollLeft: textarea?.scrollLeft ?? 0,
  }
}

function restoreTextareaSelection(
  textareaRef: RefObject<HTMLTextAreaElement>,
  start: number,
  end: number,
  viewport: Pick<TextareaSelection, 'scrollTop' | 'scrollLeft'>,
) {
  window.setTimeout(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.focus({ preventScroll: true })
    textarea.setSelectionRange(start, end)
    textarea.scrollTop = viewport.scrollTop
    textarea.scrollLeft = viewport.scrollLeft
  }, 0)
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
  // Когда текст уже был выделен, после вставки выделить эту подстроку из `after`
  // (например URL у ссылки), чтобы её можно было сразу перепечатать. Без выделения
  // работает обычная логика — выделяется вставленный плейсхолдер.
  selectInAfterWhenSelected?: string
}

const tools: Tool[] = [
  { label: 'Жирный', text: 'B', before: '**', after: '**', placeholder: 'жирный текст' },
  { label: 'Курсив', text: 'I', before: '*', after: '*', placeholder: 'курсив' },
  { label: 'Заголовок', text: 'H', before: '## ', after: '', placeholder: 'Заголовок' },
  { label: 'Цитата', text: '❝', before: '> ', after: '', placeholder: 'Цитата' },
  { label: 'Маркированный список', text: '•', before: '', after: '', placeholder: 'Пункт списка', format: formatUnorderedList },
  { label: 'Нумерованный список', text: '1.', before: '', after: '', placeholder: 'Пункт списка', format: formatOrderedList },
  { label: 'Сворачиваемый раздел', text: '▾', before: '\n<details>\n<summary>Заголовок раздела</summary>\n\n', after: '\n</details>', placeholder: 'Текст раздела' },
  { label: 'Ссылка', text: 'Link', before: '[', after: '](https://)', placeholder: 'текст ссылки', selectInAfterWhenSelected: 'https://' },
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
  const selectionRef = useRef<TextareaSelection>({ start: 0, end: 0, scrollTop: 0, scrollLeft: 0 })

  function openWikipediaDialog() {
    selectionRef.current = readTextareaSelection(textareaRef.current, value.length)
    setDialogOpen(true)
  }

  function insertWikipedia(target: WikipediaTarget) {
    const { start, end, scrollTop, scrollLeft } = selectionRef.current
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
    restoreTextareaSelection(textareaRef, authorStart, authorEnd, { scrollTop, scrollLeft })
  }

  function applyTool(tool: Tool) {
    const selection = readTextareaSelection(textareaRef.current, value.length)
    const { start, end } = selection
    const selected = value.slice(start, end)
    const inner = tool.format ? tool.format(selected || tool.placeholder) : selected || tool.placeholder
    const next = `${value.slice(0, start)}${tool.before}${inner}${tool.after}${value.slice(end)}`
    onChange(next)

    const hadSelection = start !== end
    const afterTarget = tool.selectInAfterWhenSelected
    if (hadSelection && afterTarget) {
      const offset = tool.after.indexOf(afterTarget)
      const cursorStart = start + tool.before.length + inner.length + offset
      const cursorEnd = cursorStart + afterTarget.length
      restoreTextareaSelection(textareaRef, cursorStart, cursorEnd, selection)
    } else {
      const cursorStart = start + tool.before.length
      const cursorEnd = cursorStart + inner.length
      restoreTextareaSelection(textareaRef, cursorStart, cursorEnd, selection)
    }
  }

  return (
    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
      {tools.map(tool => (
        <button
          key={tool.label}
          type="button"
          aria-label={tool.label}
          onMouseDown={event => event.preventDefault()}
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
        onMouseDown={event => event.preventDefault()}
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
