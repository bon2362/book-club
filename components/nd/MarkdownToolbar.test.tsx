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

  function openDialog(textarea: HTMLTextAreaElement, start: number, end: number) {
    textarea.focus()
    textarea.setSelectionRange(start, end)
    fireEvent.click(screen.getByRole('button', { name: 'Вставка из Wikipedia' }))
  }

  it('wraps selected text in a portable Wikipedia block', () => {
    render(<Harness />)
    const textarea = screen.getByLabelText('markdown') as HTMLTextAreaElement
    openDialog(textarea, 0, 6)

    fireEvent.change(screen.getByLabelText('Ссылка на статью Wikipedia'), {
      target: { value: 'https://ru.wikipedia.org/wiki/Социализм' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Вставить' }))

    expect(textarea.value).toContain('> важный')
    expect(textarea.value).toContain(
      '> [Wikipedia: Социализм](https://ru.wikipedia.org/wiki/%D0%A1%D0%BE%D1%86%D0%B8%D0%B0%D0%BB%D0%B8%D0%B7%D0%BC "wikipedia")',
    )
  })

  it('prefixes every selected line, keeping empty lines as bare quote markers', () => {
    render(<Harness />)
    const textarea = screen.getByLabelText('markdown') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'первая\n\nвторая' } })
    openDialog(textarea, 0, textarea.value.length)

    fireEvent.change(screen.getByLabelText('Ссылка на статью Wikipedia'), {
      target: { value: 'https://ru.wikipedia.org/wiki/Социализм' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Вставить' }))

    expect(textarea.value).toContain('> первая\n>\n> вторая')
  })

  it('inserts a placeholder author line for an empty selection', () => {
    render(<Harness />)
    const textarea = screen.getByLabelText('markdown') as HTMLTextAreaElement
    openDialog(textarea, textarea.value.length, textarea.value.length)

    fireEvent.change(screen.getByLabelText('Ссылка на статью Wikipedia'), {
      target: { value: 'https://ru.wikipedia.org/wiki/Социализм' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Вставить' }))

    expect(textarea.value).toContain('> Текст вставки')
  })

  it('keeps the dialog open with an inline error for a deceptive URL', () => {
    render(<Harness />)
    const textarea = screen.getByLabelText('markdown') as HTMLTextAreaElement
    openDialog(textarea, 0, 6)

    fireEvent.change(screen.getByLabelText('Ссылка на статью Wikipedia'), {
      target: { value: 'https://wikipedia.org.evil.com/wiki/X' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Вставить' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(textarea.value).toBe('важный текст')
  })

  it('closes the dialog on Escape without changing the textarea', () => {
    render(<Harness />)
    const textarea = screen.getByLabelText('markdown') as HTMLTextAreaElement
    openDialog(textarea, 0, 6)

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(textarea.value).toBe('важный текст')
  })

  it('restores focus and selects the author text after insertion', () => {
    jest.useFakeTimers()
    try {
      render(<Harness />)
      const textarea = screen.getByLabelText('markdown') as HTMLTextAreaElement
      openDialog(textarea, 0, 6)

      fireEvent.change(screen.getByLabelText('Ссылка на статью Wikipedia'), {
        target: { value: 'https://ru.wikipedia.org/wiki/Социализм' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Вставить' }))
      jest.runOnlyPendingTimers()

      expect(textarea).toHaveFocus()
      expect(textarea.value.slice(textarea.selectionStart, textarea.selectionEnd)).toBe('важный')
    } finally {
      jest.useRealTimers()
    }
  })
})
