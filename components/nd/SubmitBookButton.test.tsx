/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import SubmitBookButton from './SubmitBookButton'

describe('SubmitBookButton', () => {
  it('рендерит текст "Предложить книгу"', () => {
    render(<SubmitBookButton onClick={() => {}} />)
    expect(screen.getByRole('button', { name: /предложить книгу/i })).toBeInTheDocument()
  })

  it('вызывает onClick при клике', () => {
    const onClick = jest.fn()
    render(<SubmitBookButton onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
