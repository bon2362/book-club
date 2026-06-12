import { render, screen } from '@testing-library/react'
import AuthErrorBanner from './AuthErrorBanner'

let mockSearchParams = new URLSearchParams()
const replace = jest.fn()

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ replace }),
}))

describe('AuthErrorBanner', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams()
    replace.mockClear()
  })

  it('shows Telegram auth failure', () => {
    mockSearchParams = new URLSearchParams('auth=failed')

    render(<AuthErrorBanner />)

    expect(screen.getByRole('alert')).toHaveTextContent('Не получилось войти через Telegram')
  })

  it('shows successful Telegram linking result', () => {
    mockSearchParams = new URLSearchParams('account_link=telegram_ok')

    render(<AuthErrorBanner />)

    expect(screen.getByRole('alert')).toHaveTextContent('Telegram привязан к вашему профилю.')
  })

  it('shows Telegram linking conflict result', () => {
    mockSearchParams = new URLSearchParams('account_link=telegram_conflict')

    render(<AuthErrorBanner />)

    expect(screen.getByRole('alert')).toHaveTextContent('Этот Telegram уже привязан к другому профилю')
  })
})
