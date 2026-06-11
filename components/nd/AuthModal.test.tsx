/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import AuthModal from './AuthModal'
import { AUTH_PROVIDER_MEMORY_KEY } from './auth-provider-memory'

jest.mock('next-auth/react', () => ({
  signIn: jest.fn(),
}))

jest.mock('@/lib/analytics', () => ({
  track: jest.fn(),
}))

function renderModal() {
  return render(<AuthModal isOpen={true} onClose={jest.fn()} />)
}

describe('AuthModal — remembered provider hint', () => {
  beforeEach(() => {
    window.localStorage.clear()
    jest.clearAllMocks()
  })

  it('shows the last-login badge in the Telegram area when telegram is remembered', () => {
    window.localStorage.setItem(AUTH_PROVIDER_MEMORY_KEY, 'telegram')

    renderModal()

    expect(screen.getByText('последний способ входа')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /войти через google/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /войти другим способом/i })).toBeInTheDocument()
  })

  it('opens secondary methods automatically for remembered google and shows the badge on the Google button', () => {
    window.localStorage.setItem(AUTH_PROVIDER_MEMORY_KEY, 'google')

    renderModal()

    expect(screen.getByRole('button', { name: /скрыть/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /войти через google/i })).toBeInTheDocument()
    expect(screen.getByText('последний способ входа')).toBeInTheDocument()
  })

  it('opens secondary methods automatically for remembered email and shows the badge on the email form', () => {
    window.localStorage.setItem(AUTH_PROVIDER_MEMORY_KEY, 'email')

    renderModal()

    expect(screen.getByRole('button', { name: /скрыть/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/ваш@email.com/i)).toBeInTheDocument()
    expect(screen.getByText('последний способ входа')).toBeInTheDocument()
  })
})
