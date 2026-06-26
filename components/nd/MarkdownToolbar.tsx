'use client'

import type { RefObject } from 'react'

interface Props {
  textareaRef: RefObject<HTMLTextAreaElement>
  value: string
  onChange: (value: string) => void
}

interface Tool {
  label: string
  text: string
  before: string
  after: string
  placeholder: string
}

const tools: Tool[] = [
  { label: 'Жирный', text: 'B', before: '**', after: '**', placeholder: 'жирный текст' },
  { label: 'Курсив', text: 'I', before: '*', after: '*', placeholder: 'курсив' },
  { label: 'Заголовок', text: 'H', before: '## ', after: '', placeholder: 'Заголовок' },
  { label: 'Цитата', text: '❝', before: '> ', after: '', placeholder: 'Цитата' },
  { label: 'Список', text: '•', before: '- ', after: '', placeholder: 'Пункт списка' },
  { label: 'Сворачиваемый раздел', text: '▾', before: '\n<details>\n<summary>Заголовок раздела</summary>\n\n', after: '\n</details>', placeholder: 'Текст раздела' },
  { label: 'Ссылка', text: 'Link', before: '[', after: '](https://)', placeholder: 'текст ссылки' },
]

export default function MarkdownToolbar({ textareaRef, value, onChange }: Props) {
  function applyTool(tool: Tool) {
    const textarea = textareaRef.current
    const start = textarea?.selectionStart ?? value.length
    const end = textarea?.selectionEnd ?? value.length
    const selected = value.slice(start, end)
    const inner = selected || tool.placeholder
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
    </div>
  )
}
