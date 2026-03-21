/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ContactsForm from './ContactsForm'

function renderForm(overrides?: Partial<React.ComponentProps<typeof ContactsForm>>) {
  const props = {
    onSave: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  }
  return { ...render(<ContactsForm {...props} />), props }
}

describe('ContactsForm — рендер', () => {
  it('показывает "Расскажите о себе" для нового пользователя (без defaultName)', () => {
    renderForm()
    expect(screen.getByText('Расскажите о себе')).toBeInTheDocument()
  })

  it('показывает "Редактировать профиль" для существующего пользователя (с defaultName)', () => {
    renderForm({ defaultName: 'Иван' })
    expect(screen.getByText('Редактировать профиль')).toBeInTheDocument()
  })

  it('рендерит dialog с aria-атрибутами', () => {
    renderForm()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('содержит поля Имя и Telegram', () => {
    renderForm()
    expect(screen.getByLabelText('Имя')).toBeInTheDocument()
    expect(screen.getByLabelText('Telegram')).toBeInTheDocument()
  })

  it('показывает defaultName и defaultContacts в полях', () => {
    renderForm({ defaultName: 'Мария', defaultContacts: '@maria' })
    expect(screen.getByLabelText('Имя')).toHaveValue('Мария')
    expect(screen.getByLabelText('Telegram')).toHaveValue('@maria')
  })
})

describe('ContactsForm — валидация и сабмит', () => {
  it('показывает ошибку при пустом имени', async () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(screen.getByText('Введите имя')).toBeInTheDocument())
  })

  it('не вызывает onSave при пустом имени', async () => {
    const { props } = renderForm()
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(screen.getByText('Введите имя')).toBeInTheDocument())
    expect(props.onSave).not.toHaveBeenCalled()
  })

  it('вызывает onSave с правильными аргументами при корректном заполнении', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined)
    const onClose = jest.fn()
    render(<ContactsForm onSave={onSave} onClose={onClose} />)

    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Алёна' } })
    fireEvent.change(screen.getByLabelText('Telegram'), { target: { value: '@alena' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Алёна', '@alena'))
  })

  it('вызывает onClose после успешного сохранения', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined)
    const onClose = jest.fn()
    render(<ContactsForm onSave={onSave} onClose={onClose} />)

    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Алёна' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('показывает ошибку если onSave бросает исключение', async () => {
    const onSave = jest.fn().mockRejectedValue(new Error('network error'))
    render(<ContactsForm defaultName="Иван" onSave={onSave} onClose={jest.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() =>
      expect(screen.getByText('Что-то пошло не так, попробуйте снова')).toBeInTheDocument()
    )
  })
})

describe('ContactsForm — telegramLocked', () => {
  it('поле Telegram readOnly при telegramLocked=true', () => {
    renderForm({ defaultContacts: '@ivan', telegramLocked: true })
    expect(screen.getByLabelText('Telegram')).toHaveAttribute('readOnly')
  })

  it('поле Telegram редактируемо при telegramLocked=false', () => {
    renderForm({ defaultContacts: '@ivan', telegramLocked: false })
    expect(screen.getByLabelText('Telegram')).not.toHaveAttribute('readOnly')
  })

  it('показывает подсказку "Привязан к Telegram-аккаунту" при telegramLocked', () => {
    renderForm({ telegramLocked: true })
    expect(screen.getByText('Привязан к Telegram-аккаунту')).toBeInTheDocument()
  })
})

describe('ContactsForm — закрытие', () => {
  it('клавиша Escape вызывает onClose', () => {
    const { props } = renderForm()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalled()
  })

  it('клик на крестик вызывает onClose', () => {
    const { props } = renderForm()
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(props.onClose).toHaveBeenCalled()
  })
})

describe('ContactsForm — удаление аккаунта', () => {
  it('не показывает кнопку удаления без prop onDelete', () => {
    renderForm({ defaultName: 'Иван' })
    expect(screen.queryByText('Удалить аккаунт')).not.toBeInTheDocument()
  })

  it('не показывает кнопку удаления без defaultName (новый пользователь)', () => {
    renderForm({ onDelete: jest.fn() })
    expect(screen.queryByText('Удалить аккаунт')).not.toBeInTheDocument()
  })

  it('показывает кнопку "Удалить аккаунт" когда onDelete и defaultName присутствуют', () => {
    renderForm({ defaultName: 'Иван', onDelete: jest.fn() })
    expect(screen.getByText('Удалить аккаунт')).toBeInTheDocument()
  })
})
