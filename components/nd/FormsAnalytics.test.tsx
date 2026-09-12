/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { track } from '@/lib/analytics'
import ContactsForm from './ContactsForm'
import SubmitBookForm from './SubmitBookForm'
import FeedbackForm from './FeedbackForm'

jest.mock('@/lib/analytics', () => ({ track: jest.fn() }))

const mockTrack = track as jest.Mock
beforeEach(() => mockTrack.mockClear())

describe('первичный профиль', () => {
  it('показ формы у нового пользователя', () => {
    render(<ContactsForm onSave={jest.fn()} onClose={jest.fn()} />)
    expect(mockTrack).toHaveBeenCalledWith('contacts_form_shown', { is_first_time: true })
  })

  it('закрытие крестиком без сохранения — с признаком, что человек что-то ввёл', () => {
    const onClose = jest.fn()
    render(<ContactsForm onSave={jest.fn()} onClose={onClose} />)
    fireEvent.change(screen.getByLabelText(/имя/i), { target: { value: 'Иван' } })
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(mockTrack).toHaveBeenCalledWith('contacts_form_dismissed', { is_first_time: true, via: 'close_button', had_input: true })
    expect(onClose).toHaveBeenCalled()
  })

  it('Escape тоже считается закрытием без сохранения', () => {
    render(<ContactsForm onSave={jest.fn()} onClose={jest.fn()} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(mockTrack).toHaveBeenCalledWith('contacts_form_dismissed', expect.objectContaining({ via: 'escape', had_input: false }))
  })

  it('успешное сохранение не считается закрытием без сохранения', async () => {
    render(<ContactsForm onSave={jest.fn().mockResolvedValue(undefined)} onClose={jest.fn()} />)
    fireEvent.change(screen.getByLabelText(/имя/i), { target: { value: 'Иван' } })
    fireEvent.click(screen.getByRole('button', { name: /сохранить/i }))
    await waitFor(() => expect(mockTrack).toHaveBeenCalledWith('contacts_saved', { isFirstTime: true }))
    expect(mockTrack).not.toHaveBeenCalledWith('contacts_form_dismissed', expect.anything())
  })

  it('пустое имя шлёт contacts_form_error', () => {
    render(<ContactsForm onSave={jest.fn()} onClose={jest.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /сохранить/i }))
    expect(mockTrack).toHaveBeenCalledWith('contacts_form_error', { reason: 'name_required', is_first_time: true })
  })
})

describe('«Предложить книгу»', () => {
  beforeEach(() => { global.fetch = jest.fn() })

  it('открытие формы', () => {
    render(<SubmitBookForm isOpen onClose={jest.fn()} />)
    expect(mockTrack).toHaveBeenCalledWith('submit_book_form_opened', { prefilled_author: false })
  })

  it('закрытие без отправки сообщает, сколько полей заполнено', () => {
    render(<SubmitBookForm isOpen onClose={jest.fn()} />)
    fireEvent.change(screen.getByLabelText(/Название/i), { target: { value: 'Сапиенс' } })
    fireEvent.change(screen.getByLabelText(/Писатель/i), { target: { value: 'Харари' } })
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(mockTrack).toHaveBeenCalledWith('submit_book_form_dismissed', { filled_fields: 2 })
  })

  it('незаполненные обязательные поля', () => {
    render(<SubmitBookForm isOpen onClose={jest.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /отправить заявку/i }))
    expect(mockTrack).toHaveBeenCalledWith('submit_book_form_invalid', { missing: ['title', 'author', 'whyRead'] })
  })

  it('сбой отправки', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: false })
    render(<SubmitBookForm isOpen onClose={jest.fn()} />)
    fireEvent.change(screen.getByLabelText(/Название/i), { target: { value: 'Сапиенс' } })
    fireEvent.change(screen.getByLabelText(/Писатель/i), { target: { value: 'Харари' } })
    fireEvent.change(screen.getByLabelText(/Почему предлагаю прочитать/i), { target: { value: 'Интересно' } })
    fireEvent.click(screen.getByRole('button', { name: /отправить заявку/i }))
    await waitFor(() => expect(mockTrack).toHaveBeenCalledWith('submit_book_form_failed'))
  })
})

describe('обратная связь', () => {
  it('открытие и закрытие без отправки', () => {
    render(<FeedbackForm isOpen onClose={jest.fn()} currentUser={null} />)
    expect(mockTrack).toHaveBeenCalledWith('feedback_form_opened')
    fireEvent.change(screen.getByLabelText(/сообщение/i), { target: { value: 'Текст' } })
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(mockTrack).toHaveBeenCalledWith('feedback_form_dismissed', { had_message: true })
  })

  it('просьба указать email', () => {
    render(<FeedbackForm isOpen onClose={jest.fn()} currentUser={null} />)
    fireEvent.change(screen.getByLabelText(/сообщение/i), { target: { value: 'Текст' } })
    fireEvent.click(screen.getByRole('button', { name: /^отправить$/i }))
    expect(mockTrack).toHaveBeenCalledWith('feedback_email_prompt_shown')
  })
})
