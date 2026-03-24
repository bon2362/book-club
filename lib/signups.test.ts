import {
  parseSignupRow,
  buildSignupRow,
  getAllSignups,
  markSignupDeleted,
  markSignupDeletedByAdmin,
  removeBookFromSignup,
  upsertSignup,
} from './signups'

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockGet = jest.fn()
const mockUpdate = jest.fn()
const mockAppend = jest.fn()

jest.mock('googleapis', () => ({
  google: {
    auth: { GoogleAuth: jest.fn() },
    sheets: () => ({
      spreadsheets: { values: { get: mockGet, update: mockUpdate, append: mockAppend } },
    }),
  },
}))

// GOOGLE_SERVICE_ACCOUNT_KEY нужен для getSheets()
process.env.GOOGLE_SERVICE_ACCOUNT_KEY = JSON.stringify({ type: 'service_account' })
process.env.GOOGLE_SHEETS_ID = 'test-sheet-id'

function makeRow(overrides: Record<number, string> = {}): string[] {
  const base = ['2024-01-01', 'user@test.com', 'Иван', 'ivan@mail.ru', '@ivan', '[]', '', '']
  return base.map((v, i) => overrides[i] ?? v)
}

describe('getAllSignups', () => {
  it('возвращает строки без TO DELETE', async () => {
    mockGet.mockResolvedValue({
      data: {
        values: [
          ['timestamp', 'userId', 'name', 'email', 'contacts', 'books', 'DeleteByUser', 'DeleteByAdmin'],
          makeRow(),
          makeRow({ 1: 'other@test.com', 2: 'Пётр' }),
        ],
      },
    })
    const result = await getAllSignups()
    expect(result).toHaveLength(2)
  })

  it('фильтрует строки помеченные TO DELETE пользователем', async () => {
    mockGet.mockResolvedValue({
      data: {
        values: [
          ['header'],
          makeRow(),                          // обычный
          makeRow({ 6: 'TO DELETE' }),        // удалён пользователем
        ],
      },
    })
    const result = await getAllSignups()
    expect(result).toHaveLength(1)
    expect(result[0].userId).toBe('user@test.com')
  })

  it('фильтрует строки помеченные TO DELETE администратором', async () => {
    mockGet.mockResolvedValue({
      data: {
        values: [
          ['header'],
          makeRow({ 6: 'TO DELETE', 7: 'yes' }), // удалён админом
          makeRow({ 1: 'keep@test.com' }),
        ],
      },
    })
    const result = await getAllSignups()
    expect(result).toHaveLength(1)
    expect(result[0].userId).toBe('keep@test.com')
  })

  it('возвращает пустой массив если нет строк', async () => {
    mockGet.mockResolvedValue({ data: { values: [['header']] } })
    const result = await getAllSignups()
    expect(result).toHaveLength(0)
  })

  it('возвращает пустой массив если values null', async () => {
    mockGet.mockResolvedValue({ data: { values: null } })
    const result = await getAllSignups()
    expect(result).toHaveLength(0)
  })
})

describe('parseSignupRow', () => {
  it('парсит строку в объект пользователя', () => {
    const row = ['2024-01-01', 'user123', 'Иван', 'ivan@mail.ru', 'tg: @ivan', '["Книга 1","Книга 2"]']
    expect(parseSignupRow(row)).toEqual({
      timestamp: '2024-01-01',
      userId: 'user123',
      name: 'Иван',
      email: 'ivan@mail.ru',
      contacts: 'tg: @ivan',
      selectedBooks: ['Книга 1', 'Книга 2'],
    })
  })

  it('обрабатывает пустой массив книг', () => {
    const row = ['2024-01-01', 'u1', 'Иван', 'i@i.ru', 'tg: @i', '[]']
    expect(parseSignupRow(row).selectedBooks).toEqual([])
  })
})

describe('buildSignupRow', () => {
  it('строит строку для записи в таблицу', () => {
    const row = buildSignupRow({
      userId: 'u1', name: 'Иван', email: 'i@i.ru',
      contacts: 'tg: @i', selectedBooks: ['Книга 1'],
    })
    expect(row[1]).toBe('u1')
    expect(row[2]).toBe('Иван')
    expect(row[3]).toBe('i@i.ru')
    expect(row[4]).toBe('tg: @i')
    expect(JSON.parse(row[5])).toEqual(['Книга 1'])
  })

  it('первый элемент — ISO timestamp', () => {
    const row = buildSignupRow({ userId: 'u1', name: 'A', email: 'a@a.com', contacts: 'x', selectedBooks: [] })
    expect(new Date(row[0]).toISOString()).toBe(row[0])
  })

  it('возвращает ровно 6 элементов', () => {
    const row = buildSignupRow({ userId: 'u1', name: 'A', email: 'a@a.com', contacts: 'x', selectedBooks: [] })
    expect(row).toHaveLength(6)
  })

  it('сериализует пустой массив книг в строку "[]"', () => {
    const row = buildSignupRow({ userId: 'u1', name: 'A', email: 'a@a.com', contacts: 'x', selectedBooks: [] })
    expect(row[5]).toBe('[]')
  })

  it('сериализует несколько книг в JSON-массив', () => {
    const row = buildSignupRow({ userId: 'u1', name: 'A', email: 'a@a.com', contacts: 'x', selectedBooks: ['Книга 1', 'Книга 2'] })
    expect(JSON.parse(row[5])).toEqual(['Книга 1', 'Книга 2'])
  })
})

describe('parseSignupRow — краевые случаи', () => {
  it('обрабатывает короткую строку с отсутствующими полями', () => {
    const row = ['2024-01-01']
    const result = parseSignupRow(row)
    expect(result.userId).toBe('')
    expect(result.name).toBe('')
    expect(result.email).toBe('')
    expect(result.contacts).toBe('')
    expect(result.selectedBooks).toEqual([])
  })

  it('обрабатывает пустую строку', () => {
    const result = parseSignupRow([])
    expect(result.timestamp).toBe('')
    expect(result.selectedBooks).toEqual([])
  })
})

// ── markSignupDeleted ──────────────────────────────────────────────────────────

describe('markSignupDeleted', () => {
  beforeEach(() => {
    mockUpdate.mockResolvedValue({})
  })

  it('помечает строку пользователя как TO DELETE', async () => {
    mockGet.mockResolvedValue({
      data: {
        values: [
          ['header'],
          makeRow({ 1: 'user-123' }),
          makeRow({ 1: 'other-user' }),
        ],
      },
    })

    await markSignupDeleted('user-123')

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        range: 'signups!G2',
        requestBody: { values: [['TO DELETE']] },
      })
    )
  })

  it('ничего не делает если пользователь не найден', async () => {
    mockGet.mockResolvedValue({
      data: { values: [['header'], makeRow({ 1: 'other-user' })] },
    })

    await markSignupDeleted('unknown-user')

    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('ничего не делает если таблица пуста', async () => {
    mockGet.mockResolvedValue({ data: { values: null } })

    await markSignupDeleted('user-123')

    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('обновляет правильный номер строки для второй записи', async () => {
    mockGet.mockResolvedValue({
      data: {
        values: [
          ['header'],
          makeRow({ 1: 'first-user' }),
          makeRow({ 1: 'second-user' }),
          makeRow({ 1: 'third-user' }),
        ],
      },
    })

    await markSignupDeleted('third-user')

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ range: 'signups!G4' })
    )
  })
})

// ── markSignupDeletedByAdmin ───────────────────────────────────────────────────

describe('markSignupDeletedByAdmin', () => {
  beforeEach(() => {
    mockUpdate.mockResolvedValue({})
  })

  it('помечает строку как TO DELETE с флагом admin "yes"', async () => {
    mockGet.mockResolvedValue({
      data: {
        values: [
          ['header'],
          makeRow({ 1: 'admin-target' }),
        ],
      },
    })

    await markSignupDeletedByAdmin('admin-target')

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        range: 'signups!G2:H2',
        requestBody: { values: [['TO DELETE', 'yes']] },
      })
    )
  })

  it('ничего не делает если пользователь не найден', async () => {
    mockGet.mockResolvedValue({
      data: { values: [['header'], makeRow({ 1: 'other' })] },
    })

    await markSignupDeletedByAdmin('ghost-user')

    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

// ── removeBookFromSignup ───────────────────────────────────────────────────────

describe('removeBookFromSignup', () => {
  beforeEach(() => {
    mockUpdate.mockResolvedValue({})
  })

  it('удаляет книгу из списка пользователя', async () => {
    mockGet.mockResolvedValue({
      data: {
        values: [
          ['header'],
          makeRow({ 1: 'user-abc', 5: '["Книга A","Книга B","Книга C"]' }),
        ],
      },
    })

    await removeBookFromSignup('user-abc', 'Книга B')

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: { values: [[JSON.stringify(['Книга A', 'Книга C'])]] },
      })
    )
  })

  it('ничего не делает если пользователь не найден', async () => {
    mockGet.mockResolvedValue({
      data: { values: [['header'], makeRow({ 1: 'other' })] },
    })

    await removeBookFromSignup('ghost', 'Книга A')

    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('обновляет правильную ячейку F', async () => {
    mockGet.mockResolvedValue({
      data: {
        values: [
          ['header'],
          makeRow({ 1: 'u1' }),
          makeRow({ 1: 'u2', 5: '["Книга X"]' }),
        ],
      },
    })

    await removeBookFromSignup('u2', 'Книга X')

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ range: 'signups!F3' })
    )
  })

  it('оставляет оставшиеся книги нетронутыми', async () => {
    mockGet.mockResolvedValue({
      data: {
        values: [
          ['header'],
          makeRow({ 1: 'u1', 5: '["Книга 1","Книга 2","Книга 3"]' }),
        ],
      },
    })

    await removeBookFromSignup('u1', 'Книга 2')

    const call = mockUpdate.mock.calls[0][0]
    expect(JSON.parse(call.requestBody.values[0][0])).toEqual(['Книга 1', 'Книга 3'])
  })
})

// ── upsertSignup ───────────────────────────────────────────────────────────────

describe('upsertSignup', () => {
  const baseData = {
    userId: 'new-user',
    name: 'Иван',
    email: 'ivan@test.ru',
    contacts: '@ivan',
    selectedBooks: ['Книга 1'],
  }

  beforeEach(() => {
    mockAppend.mockResolvedValue({})
    mockUpdate.mockResolvedValue({})
    delete process.env.NEXTAUTH_TEST_MODE
  })

  it('в test-mode возвращает isNew=true без обращения к sheets', async () => {
    process.env.NEXTAUTH_TEST_MODE = 'true'

    const result = await upsertSignup(baseData)

    expect(result).toEqual({ isNew: true, addedBooks: ['Книга 1'] })
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('добавляет новую запись если пользователь не существует', async () => {
    mockGet.mockResolvedValue({
      data: { values: [['header']] },
    })

    const result = await upsertSignup(baseData)

    expect(mockAppend).toHaveBeenCalled()
    expect(result).toEqual({ isNew: true, addedBooks: ['Книга 1'] })
  })

  it('обновляет существующую запись и возвращает только новые книги', async () => {
    mockGet.mockResolvedValue({
      data: {
        values: [
          ['header'],
          makeRow({ 1: 'new-user', 5: '["Книга 1","Книга 2"]' }),
        ],
      },
    })

    const result = await upsertSignup({ ...baseData, selectedBooks: ['Книга 1', 'Книга 3'] })

    expect(mockUpdate).toHaveBeenCalled()
    expect(result.isNew).toBe(false)
    expect(result.addedBooks).toEqual(['Книга 3']) // Книга 1 была, Книга 3 новая
  })

  it('сохраняет оригинальный timestamp при обновлении', async () => {
    const origTimestamp = '2024-01-01T00:00:00.000Z'
    mockGet.mockResolvedValue({
      data: {
        values: [
          ['header'],
          makeRow({ 0: origTimestamp, 1: 'new-user' }),
        ],
      },
    })

    await upsertSignup(baseData)

    const updateCall = mockUpdate.mock.calls[0][0]
    expect(updateCall.requestBody.values[0][0]).toBe(origTimestamp)
  })

  it('возвращает пустой массив addedBooks если все книги уже были', async () => {
    mockGet.mockResolvedValue({
      data: {
        values: [
          ['header'],
          makeRow({ 1: 'new-user', 5: '["Книга 1"]' }),
        ],
      },
    })

    const result = await upsertSignup(baseData)

    expect(result.isNew).toBe(false)
    expect(result.addedBooks).toEqual([])
  })

  it('возвращает все selectedBooks как addedBooks для нового пользователя', async () => {
    mockGet.mockResolvedValue({
      data: { values: [['header']] },
    })
    const multiBookData = { ...baseData, selectedBooks: ['Книга 1', 'Книга 2', 'Книга 3'] }

    const result = await upsertSignup(multiBookData)

    expect(result.isNew).toBe(true)
    expect(result.addedBooks).toEqual(['Книга 1', 'Книга 2', 'Книга 3'])
  })
})
