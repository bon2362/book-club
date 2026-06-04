import {
  eventDetail,
  eventTypeLabel,
  sourceLabel,
  type PreferenceEventLike,
} from '../preference-event-display'

const event = (
  eventType: string,
  metadata: PreferenceEventLike['metadata'],
  bookId: string | null = null,
): PreferenceEventLike => ({ eventType, bookId, metadata })

describe('eventTypeLabel', () => {
  it('переименовывает catalog_signup_updated в «Изменён набор»', () => {
    expect(eventTypeLabel('catalog_signup_updated')).toBe('Изменён набор')
  })

  it('переводит остальные известные типы', () => {
    expect(eventTypeLabel('book_added')).toBe('Добавлена книга')
    expect(eventTypeLabel('book_removed')).toBe('Убрана книга')
    expect(eventTypeLabel('priorities_updated')).toBe('Приоритеты')
  })

  it('возвращает исходный код для неизвестного типа', () => {
    expect(eventTypeLabel('mystery')).toBe('mystery')
  })
})

describe('sourceLabel', () => {
  it('переводит известные источники', () => {
    expect(sourceLabel('catalog')).toBe('Каталог')
    expect(sourceLabel('matching')).toBe('Матчинг')
  })
})

describe('eventDetail', () => {
  it('одиночное действие показывает название книги', () => {
    expect(eventDetail(event('book_added', { bookTitle: 'Дюна' }, 'b1'))).toBe('Дюна')
  })

  it('изменение набора показывает добавленные (+) и убранные (−) книги', () => {
    expect(
      eventDetail(event('catalog_signup_updated', {
        addedBookTitles: ['Дюна'],
        removedBookTitles: ['1984'],
      })),
    ).toBe('+Дюна, −1984')
  })

  it('только добавление без удалений', () => {
    expect(
      eventDetail(event('catalog_signup_updated', { addedBookTitles: ['Дюна', 'Мы'] })),
    ).toBe('+Дюна, +Мы')
  })

  it('приоритеты показывают нумерованный порядок', () => {
    expect(
      eventDetail(event('priorities_updated', { rankedBookTitles: ['Дюна', '1984', 'Мы'] })),
    ).toBe('1. Дюна → 2. 1984 → 3. Мы')
  })

  it('исторические события без названий падают в счётчик', () => {
    expect(eventDetail(event('catalog_signup_updated', { selectedBookIds: ['a', 'b', 'c'] }))).toBe('3 книг')
    expect(eventDetail(event('priorities_updated', { bookIds: ['a', 'b'] }))).toBe('2 книг')
  })

  it('пустые массивы дельты не считаются действием и падают в fallback', () => {
    expect(
      eventDetail(event('catalog_signup_updated', { addedBookTitles: [], removedBookTitles: [] }, 'b9')),
    ).toBe('b9')
  })

  it('без метаданных показывает bookId или тире', () => {
    expect(eventDetail(event('x', null, 'b1'))).toBe('b1')
    expect(eventDetail(event('x', null, null))).toBe('—')
  })
})
