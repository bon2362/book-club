import { render, screen } from '@testing-library/react'
import AuthorAvatar from './AuthorAvatar'

describe('AuthorAvatar', () => {
  it('shows two-word initials uppercased', () => {
    render(<AuthorAvatar name="Дмитрий Власов" />)
    expect(screen.getByText('ДВ')).toBeInTheDocument()
  })

  it('takes first two letters for a single token', () => {
    render(<AuthorAvatar name="alina.reads" />)
    expect(screen.getByText('AL')).toBeInTheDocument()
  })
})
