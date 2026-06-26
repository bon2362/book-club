import { fireEvent, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import MarkdownToolbar from './MarkdownToolbar'

function Harness() {
  const [value, setValue] = useState('важный текст')
  const ref = useRef<HTMLTextAreaElement>(null)
  return (
    <>
      <MarkdownToolbar textareaRef={ref} value={value} onChange={setValue} />
      <textarea ref={ref} aria-label="markdown" value={value} onChange={e => setValue(e.target.value)} />
    </>
  )
}

describe('MarkdownToolbar', () => {
  it('wraps selected text with bold markdown', () => {
    render(<Harness />)
    const textarea = screen.getByLabelText('markdown') as HTMLTextAreaElement
    textarea.focus()
    textarea.setSelectionRange(0, 6)

    fireEvent.click(screen.getByRole('button', { name: 'Жирный' }))

    expect(textarea.value).toBe('**важный** текст')
  })

  it('inserts a portable details block template', () => {
    render(<Harness />)
    const textarea = screen.getByLabelText('markdown') as HTMLTextAreaElement
    textarea.focus()
    textarea.setSelectionRange(textarea.value.length, textarea.value.length)

    fireEvent.click(screen.getByRole('button', { name: 'Сворачиваемый раздел' }))

    expect(textarea.value).toBe([
      'важный текст',
      '<details>',
      '<summary>Заголовок раздела</summary>',
      '',
      'Текст раздела',
      '</details>',
    ].join('\n'))
  })

  it('turns selected lines into an unordered list', () => {
    render(<Harness />)
    const textarea = screen.getByLabelText('markdown') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'первый\nвторой' } })
    textarea.focus()
    textarea.setSelectionRange(0, textarea.value.length)

    fireEvent.click(screen.getByRole('button', { name: 'Маркированный список' }))

    expect(textarea.value).toBe('- первый\n- второй')
  })

  it('turns selected lines into an ordered list', () => {
    render(<Harness />)
    const textarea = screen.getByLabelText('markdown') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'первый\nвторой' } })
    textarea.focus()
    textarea.setSelectionRange(0, textarea.value.length)

    fireEvent.click(screen.getByRole('button', { name: 'Нумерованный список' }))

    expect(textarea.value).toBe('1. первый\n2. второй')
  })
})
