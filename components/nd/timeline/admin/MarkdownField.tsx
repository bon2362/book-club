'use client'

import { useRef } from 'react'
import MarkdownToolbar from '../../MarkdownToolbar'
import { microLabelStyle, textareaStyle } from './shared'

/**
 * Описание в markdown. Редактор — существующий `MarkdownToolbar`: тот же, что
 * в саммари. Отдельного WYSIWYG в проекте нет и не заводится.
 */

interface Props {
  label: string
  value: string
  onChange: (value: string) => void
  testId: string
}

export default function MarkdownField({ label, value, onChange, testId }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  return (
    <div style={{ marginBottom: '1rem' }}>
      <span style={microLabelStyle}>{label}</span>
      <div style={{ marginBottom: '0.4rem' }}>
        <MarkdownToolbar textareaRef={textareaRef} value={value} onChange={onChange} />
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={event => onChange(event.target.value)}
        data-testid={testId}
        aria-label={label}
        style={textareaStyle}
      />
    </div>
  )
}
