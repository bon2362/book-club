import { fireEvent, render, screen } from '@testing-library/react'
import MatchingModeTabs from './MatchingModeTabs'

describe('MatchingModeTabs', () => {
  it('exposes accessible tabs and changes mode', () => {
    const onChange = jest.fn()
    render(<MatchingModeTabs value="books" onChange={onChange} />)
    expect(screen.getByRole('tab', { name: 'Книги' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('tab', { name: 'Сценарии' }))
    expect(onChange).toHaveBeenCalledWith('scenarios')
  })

  it('supports arrow-key navigation', () => {
    const onChange = jest.fn()
    render(<MatchingModeTabs value="books" onChange={onChange} />)
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Книги' }), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith('scenarios')
  })
})
