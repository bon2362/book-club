/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SubmitBookForm from './SubmitBookForm'

function renderForm(overrides?: Partial<React.ComponentProps<typeof SubmitBookForm>>) {
  const props = {
    isOpen: true,
    onClose: jest.fn(),
    ...overrides,
  }
  return { ...render(<SubmitBookForm {...props} />), onClose: props.onClose }
}

describe('SubmitBookForm — рендер', () => {
  it('не рендерит ничего когда isOpen=false', () => {
    renderForm({ isOpen: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('рендерит поля в нужном порядке без темы', () => {
    renderForm()
    const labels = screen.getAllByText(/Название|Писатель|Почему предлагаю прочитать|Описание|Дата издания|Число страниц|Ссылка на текст|Ссылка на обложку/i)
    expect(labels.map(label => label.textContent)).toEqual([
      'Название *',
      'Писатель *',
      'Почему предлагаю прочитать *',
      'Описание',
      'Дата издания',
      'Число страниц',
      'Ссылка на текст',
      'Ссылка на обложку',
    ])
    expect(screen.queryByLabelText(/Тема/i)).not.toBeInTheDocument()
  })

  it('рендерит кнопку "Отправить заявку"', () => {
    renderForm()
    expect(screen.getByRole('button', { name: /отправить заявку/i })).toBeInTheDocument()
  })

  it('показывает новый плейсхолдер для ссылки на текст', () => {
    renderForm()
    expect(screen.getByPlaceholderText('Где купить или прочитать онлайн')).toBeInTheDocument()
  })
})

describe('SubmitBookForm — валидация', () => {
  it('показывает ошибки для всех обязательных полей при отправке пустой формы', async () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: /отправить заявку/i }))
    await waitFor(() => {
      const errors = screen.getAllByText('Обязательное поле')
      expect(errors.length).toBe(3) // title, author, whyRead
    })
  })

  it('показывает ошибку для title при потере фокуса с пустым значением', async () => {
    renderForm()
    const input = screen.getByLabelText(/Название/i)
    fireEvent.blur(input)
    await waitFor(() => expect(screen.getByText('Обязательное поле')).toBeInTheDocument())
  })

  it('убирает ошибку когда поле заполнено', async () => {
    renderForm()
    const input = screen.getByLabelText(/Название/i)
    fireEvent.blur(input) // trigger error
    await waitFor(() => expect(screen.getByText('Обязательное поле')).toBeInTheDocument())
    fireEvent.change(input, { target: { value: 'Тест' } })
    fireEvent.blur(input)
    await waitFor(() => expect(screen.queryByText('Обязательное поле')).not.toBeInTheDocument())
  })
})

describe('SubmitBookForm — отправка', () => {
  beforeEach(() => {
    global.fetch = jest.fn()
  })

  it('вызывает fetch с корректными данными при валидной отправке', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })
    renderForm()

    fireEvent.change(screen.getByLabelText(/Название/i), { target: { value: 'Сапиенс' } })
    fireEvent.change(screen.getByLabelText(/Писатель/i), { target: { value: 'Харари' } })
    fireEvent.change(screen.getByLabelText(/Почему предлагаю прочитать/i), { target: { value: 'Очень интересно' } })

    fireEvent.click(screen.getByRole('button', { name: /отправить заявку/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/submissions', expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }))
      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
      expect(body.title).toBe('Сапиенс')
      expect(body.author).toBe('Харари')
      expect(body.whyRead).toBe('Очень интересно')
      expect(body.topic).toBeUndefined()
    })
  })

  it('показывает success state после успешной отправки', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })
    renderForm()

    fireEvent.change(screen.getByLabelText(/Название/i), { target: { value: 'Сапиенс' } })
    fireEvent.change(screen.getByLabelText(/Писатель/i), { target: { value: 'Харари' } })
    fireEvent.change(screen.getByLabelText(/Почему предлагаю прочитать/i), { target: { value: 'Очень интересно' } })

    fireEvent.click(screen.getByRole('button', { name: /отправить заявку/i }))

    await waitFor(() => {
      expect(screen.getByText('Заявка принята!')).toBeInTheDocument()
      expect(screen.getByText(/рассмотрим её в ближайшее время/i)).toBeInTheDocument()
    })
  })

  it('показывает ошибку при неудачном запросе', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: false })
    renderForm()

    fireEvent.change(screen.getByLabelText(/Название/i), { target: { value: 'Сапиенс' } })
    fireEvent.change(screen.getByLabelText(/Писатель/i), { target: { value: 'Харари' } })
    fireEvent.change(screen.getByLabelText(/Почему предлагаю прочитать/i), { target: { value: 'Очень интересно' } })

    fireEvent.click(screen.getByRole('button', { name: /отправить заявку/i }))

    await waitFor(() => {
      expect(screen.getByText(/не удалось отправить заявку/i)).toBeInTheDocument()
    })
  })

  it('не вызывает fetch при пустых обязательных полях', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true })
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: /отправить заявку/i }))
    await waitFor(() => expect(global.fetch).not.toHaveBeenCalled())
  })
})

describe('SubmitBookForm — закрытие', () => {
  it('вызывает onClose при клике на кнопку ✕', () => {
    const { onClose } = renderForm()
    fireEvent.click(screen.getByRole('button', { name: /закрыть/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('вызывает onClose при нажатии Escape', () => {
    const { onClose } = renderForm()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
