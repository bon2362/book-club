import { render, screen } from '@testing-library/react'
import SummaryAuthorSwitcher from './SummaryAuthorSwitcher'

const authors = [
  { slug: 'аня', displayName: 'Аня' },
  { slug: 'боря', displayName: 'Боря' },
]

describe('SummaryAuthorSwitcher', () => {
  it('renders a pill per author with author query links and marks the active one', () => {
    render(<SummaryAuthorSwitcher authors={authors} activeSlug="боря" basePath="/books/x/summaries" writeHref="/books/x/my-summary/edit" />)
    const active = screen.getByRole('link', { name: /Боря/ })
    expect(active).toHaveAttribute('href', '/books/x/summaries?author=%D0%B1%D0%BE%D1%80%D1%8F')
    expect(active).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /Аня/ })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: '+ Написать своё' })).toHaveAttribute('href', '/books/x/my-summary/edit')
  })

  it('shows the single-summary note instead of pills for one author', () => {
    render(<SummaryAuthorSwitcher authors={[authors[0]]} activeSlug="аня" basePath="/books/x/summaries" writeHref="/books/x/my-summary/edit" />)
    expect(screen.getByText('Пока одно саммари этой книги.')).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+ Написать своё' })).toBeInTheDocument()
  })
})
