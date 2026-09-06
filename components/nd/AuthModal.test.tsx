/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, act } from '@testing-library/react'
import { signIn } from 'next-auth/react'
import AuthModal from './AuthModal'
import { track } from '@/lib/analytics'
import { AUTH_PROVIDER_MEMORY_KEY } from './auth-provider-memory'

jest.mock('next-auth/react', () => ({
  signIn: jest.fn(),
}))

jest.mock('@/lib/analytics', () => ({
  track: jest.fn(),
}))

const mockedTrack = track as jest.Mock
const mockedSignIn = signIn as jest.Mock

function renderModal(props: Partial<React.ComponentProps<typeof AuthModal>> = {}) {
  return render(<AuthModal isOpen={true} onClose={jest.fn()} {...props} />)
}

function openOtherMethods() {
  fireEvent.click(screen.getByRole('button', { name: /войти другим способом/i }))
}

function expectReminder(providerLabel: string) {
  expect(screen.getByText((_, element) =>
    element?.tagName.toLowerCase() === 'p' &&
    (element.textContent?.includes(`В прошлый раз вы входили через ${providerLabel}`) ?? false),
  )).toBeInTheDocument()
}

describe('AuthModal — remembered provider hint', () => {
  beforeEach(() => {
    window.localStorage.clear()
    jest.clearAllMocks()
  })

  it('shows the last-login badge in the Telegram area when telegram is remembered', () => {
    window.localStorage.setItem(AUTH_PROVIDER_MEMORY_KEY, 'telegram')

    renderModal()

    expectReminder('Telegram')
    expect(screen.getByText('Последний вход')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /войти через google/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /войти другим способом/i })).toBeInTheDocument()
  })

  it('opens secondary methods automatically for remembered google and shows the badge on the Google button', () => {
    window.localStorage.setItem(AUTH_PROVIDER_MEMORY_KEY, 'google')

    renderModal()

    expect(screen.getByRole('button', { name: /скрыть/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /войти через google/i })).toBeInTheDocument()
    expectReminder('Google')
    expect(screen.getByText('Последний вход')).toBeInTheDocument()
  })

  it('opens secondary methods automatically for remembered email and shows the badge on the email form', () => {
    window.localStorage.setItem(AUTH_PROVIDER_MEMORY_KEY, 'email')

    renderModal()

    expect(screen.getByRole('button', { name: /скрыть/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/ваш@email.com/i)).toBeInTheDocument()
    expectReminder('почту')
    expect(screen.getByText('Последний вход')).toBeInTheDocument()
  })
})

describe('AuthModal — entry_point в auth_attempt', () => {
  beforeEach(() => {
    window.localStorage.clear()
    jest.clearAllMocks()
  })

  it('прокидывает entry_point в auth_attempt при входе через Google', () => {
    renderModal({ entryPoint: 'submit_book' })

    openOtherMethods()
    fireEvent.click(screen.getByRole('button', { name: /войти через google/i }))

    expect(mockedTrack).toHaveBeenCalledWith('auth_attempt', { provider: 'google', entry_point: 'submit_book' })
    expect(mockedSignIn).toHaveBeenCalledWith('google', undefined)
  })

  it('прокидывает entry_point в auth_attempt при отправке magic link', async () => {
    mockedSignIn.mockResolvedValueOnce(undefined)
    renderModal({ entryPoint: 'book_signup' })

    openOtherMethods()
    fireEvent.change(screen.getByPlaceholderText(/ваш@email.com/i), { target: { value: 'reader@example.com' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /получить ссылку на почту/i }))
    })

    expect(mockedTrack).toHaveBeenCalledWith('auth_attempt', { provider: 'email', entry_point: 'book_signup' })
  })

  // Telegram здесь не покрыт: BOT_NAME читается из
  // process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME, а next/jest инлайнит
  // NEXT_PUBLIC_* переменные статически на этапе трансформации (как
  // webpack DefinePlugin), а не читает их в рантайме теста — в тестовой сборке
  // значение уже подставлено как undefined, и присвоение process.env в самом
  // тесте на это не влияет. При BOT_NAME=undefined кнопка «Войти через
  // Telegram» — no-op (см. AuthModal.tsx: `if (!BOT_NAME) return`), так что
  // track('auth_attempt', { provider: 'telegram', ... }) в юнит-тестах
  // недостижим без правки инфраструктуры сборки тестов. Код symmetричен коду
  // для google/email (тот же track(...entry_point) и та же запись в
  // lastProviderRef), которые покрыты тестами выше и ниже.
})

describe('AuthModal — auth_abandoned', () => {
  beforeEach(() => {
    window.localStorage.clear()
    jest.clearAllMocks()
  })

  it('шлёт auth_abandoned при закрытии крестиком без единой попытки входа', () => {
    const onClose = jest.fn()
    renderModal({ entryPoint: 'header', onClose })

    fireEvent.click(screen.getByRole('button', { name: /закрыть/i }))

    expect(mockedTrack).toHaveBeenCalledWith('auth_abandoned', { entry_point: 'header', last_provider: undefined })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('шлёт auth_abandoned с last_provider после незавершённой попытки через Google', () => {
    const onClose = jest.fn()
    renderModal({ entryPoint: 'submit_book', onClose })

    openOtherMethods()
    fireEvent.click(screen.getByRole('button', { name: /войти через google/i }))
    mockedTrack.mockClear()

    fireEvent.click(screen.getByRole('button', { name: /закрыть/i }))

    expect(mockedTrack).toHaveBeenCalledWith('auth_abandoned', { entry_point: 'submit_book', last_provider: 'google' })
  })

  it('шлёт auth_abandoned при закрытии по клику на оверлей', () => {
    const onClose = jest.fn()
    renderModal({ entryPoint: 'book_signup', onClose })

    fireEvent.click(screen.getByRole('dialog'))

    expect(mockedTrack).toHaveBeenCalledWith('auth_abandoned', { entry_point: 'book_signup', last_provider: undefined })
  })

  it('не шлёт auth_abandoned при размонтировании без явного закрытия (успешный вход не идёт через onClose)', () => {
    // Успешный вход (Telegram — window.location.reload(), Google — signIn делает
    // полный редирект) никогда не вызывает onClose: страница перезагружается или
    // уходит на другой домен. auth_abandoned шлётся только из handleClose
    // (крестик/оверлей/Escape), поэтому при размонтировании компонента в обход
    // handleClose событие уйти не должно.
    const onClose = jest.fn()
    const { unmount } = renderModal({ entryPoint: 'header', onClose })

    unmount()

    expect(mockedTrack).not.toHaveBeenCalledWith('auth_abandoned', expect.anything())
    expect(onClose).not.toHaveBeenCalled()
  })

  // Успешное завершение входа через Telegram (poll → window.location.reload(),
  // без вызова onClose) покрыто в AuthModal.telegram.test.tsx.
})
