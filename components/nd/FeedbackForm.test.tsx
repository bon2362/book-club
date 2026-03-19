/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import FeedbackForm from './FeedbackForm'
import type { UserSignup } from '@/lib/signups'

const mockUser: UserSignup = {
  userId: 'user-1',
  timestamp: '2026-01-01T00:00:00Z',
  name: 'Иван',
  contacts: '@ivan',
  email: 'ivan@test.com',
  selectedBooks: [],
}

function renderForm(overrides?: Partial<React.ComponentProps<typeof FeedbackForm>>) {
  const props = {
    isOpen: true,
    onClose: jest.fn(),
    currentUser: null,
    ...overrides,
  }
  return { ...render(<FeedbackForm {...props} />), onClose: props.onClose }
}

describe('FeedbackForm — рендер', () => {
  it('не рендерит ничего когда isOpen=false', () => {
    renderForm({ isOpen: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('рендерит dialog с правильными aria-атрибутами', () => {
    renderForm()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby', 'feedback-form-title')
  })

  it('рендерит заголовок с правильным id', () => {
    renderForm()
    const heading = screen.getByRole('heading', { name: /написать автору проекта/i })
    expect(heading).toHaveAttribute('id', 'feedback-form-title')
  })

  it('рендерит все три поля', () => {
    renderForm()
    expect(screen.getByLabelText(/сообщение/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/имя/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
  })

  it('кнопка "Отправить" изначально задизейблена (message пустой)', () => {
    renderForm()
    expect(screen.getByRole('button', { name: /отправить/i })).toBeDisabled()
  })

  it('кнопка "Отправить" активна когда message заполнен', () => {
    renderForm()
    fireEvent.change(screen.getByLabelText(/сообщение/i), { target: { value: 'Привет' } })
    expect(screen.getByRole('button', { name: /отправить/i })).not.toBeDisabled()
  })
})

describe('FeedbackForm — предзаполнение', () => {
  it('предзаполняет имя из currentUser.name', () => {
    renderForm({ currentUser: mockUser })
    expect(screen.getByLabelText(/имя/i)).toHaveValue('Иван')
  })

  it('предзаполняет email из userEmail', () => {
    renderForm({ userEmail: 'test@test.com' })
    expect(screen.getByLabelText(/email/i)).toHaveValue('test@test.com')
  })

  it('поля пустые для анонимного пользователя', () => {
    renderForm()
    expect(screen.getByLabelText(/имя/i)).toHaveValue('')
    expect(screen.getByLabelText(/email/i)).toHaveValue('')
  })
})

describe('FeedbackForm — email confirmation flow', () => {
  it('показывает предупреждение при отправке без email', () => {
    renderForm()
    fireEvent.change(screen.getByLabelText(/сообщение/i), { target: { value: 'Текст' } })
    fireEvent.click(screen.getByRole('button', { name: /^отправить$/i }))
    expect(screen.getByText(/без email/i)).toBeInTheDocument()
    expect(screen.getByText(/отправить всё равно/i)).toBeInTheDocument()
  })

  it('не отправляет при повторном клике на "Отправить" в needs-email-confirm state', async () => {
    global.fetch = jest.fn()
    renderForm()
    fireEvent.change(screen.getByLabelText(/сообщение/i), { target: { value: 'Текст' } })
    fireEvent.click(screen.getByRole('button', { name: /^отправить$/i })) // first click → show warning
    fireEvent.click(screen.getByRole('button', { name: /^отправить$/i })) // second click → still no send
    await waitFor(() => expect(global.fetch).not.toHaveBeenCalled())
  })

  it('"Отправить всё равно" отправляет форму без email', async () => {
    ;(global.fetch as jest.Mock) = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) })
    renderForm()
    fireEvent.change(screen.getByLabelText(/сообщение/i), { target: { value: 'Текст' } })
    fireEvent.click(screen.getByRole('button', { name: /^отправить$/i }))
    fireEvent.click(screen.getByRole('button', { name: /отправить всё равно/i }))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/feedback', expect.any(Object)))
  })

  it('предупреждение исчезает когда email заполняется', async () => {
    renderForm()
    fireEvent.change(screen.getByLabelText(/сообщение/i), { target: { value: 'Текст' } })
    fireEvent.click(screen.getByRole('button', { name: /^отправить$/i }))
    expect(screen.getByText(/без email/i)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@test.com' } })
    await waitFor(() => expect(screen.queryByText(/без email/i)).not.toBeInTheDocument())
  })

  it('не показывает предупреждение когда email заполнен — сразу отправляет', async () => {
    ;(global.fetch as jest.Mock) = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) })
    renderForm({ userEmail: 'user@test.com' })
    fireEvent.change(screen.getByLabelText(/сообщение/i), { target: { value: 'Текст' } })
    fireEvent.click(screen.getByRole('button', { name: /^отправить$/i }))
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(screen.queryByText(/без email/i)).not.toBeInTheDocument()
  })
})

describe('FeedbackForm — отправка', () => {
  beforeEach(() => {
    global.fetch = jest.fn()
  })

  it('показывает success state после успешной отправки', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) })
    renderForm({ userEmail: 'user@test.com' })
    fireEvent.change(screen.getByLabelText(/сообщение/i), { target: { value: 'Привет' } })
    fireEvent.click(screen.getByRole('button', { name: /^отправить$/i }))
    await waitFor(() => expect(screen.getByText(/спасибо/i)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /закрыть/i })).toBeInTheDocument()
  })

  it('показывает ошибку при неудачном запросе', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: false })
    renderForm({ userEmail: 'user@test.com' })
    fireEvent.change(screen.getByLabelText(/сообщение/i), { target: { value: 'Привет' } })
    fireEvent.click(screen.getByRole('button', { name: /^отправить$/i }))
    await waitFor(() => expect(screen.getByText(/не удалось/i)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /^отправить$/i })).toBeInTheDocument()
  })

  it('отправляет правильные данные в API', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) })
    renderForm({ currentUser: mockUser, userEmail: 'ivan@test.com' })
    fireEvent.change(screen.getByLabelText(/сообщение/i), { target: { value: 'Вопрос' } })
    fireEvent.click(screen.getByRole('button', { name: /^отправить$/i }))
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
    expect(body.message).toBe('Вопрос')
    expect(body.name).toBe('Иван')
    expect(body.email).toBe('ivan@test.com')
  })
})

describe('FeedbackForm — закрытие', () => {
  it('вызывает onClose при нажатии Escape', () => {
    const { onClose } = renderForm()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('вызывает onClose при клике на overlay', () => {
    const { onClose } = renderForm()
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalled()
  })

  it('не вызывает onClose при клике внутри модала', () => {
    const { onClose } = renderForm()
    fireEvent.click(screen.getByRole('heading', { name: /написать автору проекта/i }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('не закрывает форму при Escape во время отправки', async () => {
    ;(global.fetch as jest.Mock) = jest.fn(() => new Promise(() => {})) // never resolves
    const { onClose } = renderForm({ userEmail: 'user@test.com' })
    fireEvent.change(screen.getByLabelText(/сообщение/i), { target: { value: 'Текст' } })
    fireEvent.click(screen.getByRole('button', { name: /^отправить$/i }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('FeedbackForm — сброс при закрытии', () => {
  it('сбрасывает message и восстанавливает предзаполненные значения при закрытии', () => {
    const { rerender } = renderForm({ currentUser: mockUser, userEmail: 'ivan@test.com' })
    fireEvent.change(screen.getByLabelText(/сообщение/i), { target: { value: 'Привет' } })
    fireEvent.change(screen.getByLabelText(/имя/i), { target: { value: 'Другое имя' } })
    rerender(<FeedbackForm isOpen={false} onClose={jest.fn()} currentUser={mockUser} userEmail="ivan@test.com" />)
    rerender(<FeedbackForm isOpen={true} onClose={jest.fn()} currentUser={mockUser} userEmail="ivan@test.com" />)
    expect(screen.getByLabelText(/сообщение/i)).toHaveValue('')
    expect(screen.getByLabelText(/имя/i)).toHaveValue('Иван')
  })
})
