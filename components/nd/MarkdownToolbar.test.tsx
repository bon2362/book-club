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
})
