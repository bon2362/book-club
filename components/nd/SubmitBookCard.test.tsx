/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import SubmitBookCard from './SubmitBookCard'

describe('SubmitBookCard', () => {
  it('рендерит текст "Предложить книгу"', () => {
    render(<SubmitBookCard onClick={() => {}} />)
    expect(screen.getByText('Предложить книгу')).toBeInTheDocument()
  })

  it('рендерит подпись', () => {
    render(<SubmitBookCard onClick={() => {}} />)
    expect(screen.getByText(/Предложите книгу для/i)).toBeInTheDocument()
  })

  it('вызывает onClick при клике', () => {
    const onClick = jest.fn()
    render(<SubmitBookCard onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('имеет aria-label "Предложить книгу"', () => {
    render(<SubmitBookCard onClick={() => {}} />)
    expect(screen.getByRole('button', { name: /предложить книгу/i })).toBeInTheDocument()
  })
})
