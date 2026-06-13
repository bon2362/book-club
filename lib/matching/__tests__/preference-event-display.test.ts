import {
  eventDetail,
  eventTypeLabel,
  formatParticipant,
  priorityDiff,
  sourceLabel,
  type PreferenceEventLike,
} from '../preference-event-display'

const event = (
  eventType: string,
  metadata: PreferenceEventLike['metadata'],
  bookId: string | null = null,
  source?: string,
): PreferenceEventLike => ({ eventType, bookId, metadata, source })

describe('eventTypeLabel', () => {
  it('переименовывает catalog_signup_updated в «Изменён набор»', () => {
    expect(eventTypeLabel('catalog_signup_updated')).toBe('Изменён набор')
  })

  it('переводит остальные известные типы', () => {
    expect(eventTypeLabel('book_added')).toBe('Добавлена книга')
    expect(eventTypeLabel('book_removed')).toBe('Убрана книга')
    expect(eventTypeLabel('priorities_updated')).toBe('Приоритеты')
  })

  it('переводит participant_left', () => {
    expect(eventTypeLabel('participant_left')).toBe('Покинул:а сессию')
  })

  it('возвращает исходный код для неизвестного типа', () => {
    expect(eventTypeLabel('mystery')).toBe('mystery')
  })
})

describe('formatParticipant', () => {
  it('имя и псевдоним → «Имя (Псевдоним)»', () => {
    expect(formatParticipant({ name: 'Иван', pseudonym: 'Белка', userId: 'u1' })).toBe('Иван (Белка)')
  })

  it('только имя', () => {
    expect(formatParticipant({ name: 'Иван', pseudonym: null, userId: 'u1' })).toBe('Иван')
  })

  it('только псевдоним', () => {
    expect(formatParticipant({ name: null, pseudonym: 'Белка', userId: 'u1' })).toBe('Белка')
  })

  it('ничего нет → короткий id', () => {
    expect(formatParticipant({ name: null, pseudonym: null, userId: '24a75fbc-a1f9-1234' })).toBe('24a75fbc-a1f…')
  })

  it('пустые строки трактуются как отсутствие', () => {
    expect(formatParticipant({ name: '  ', pseudonym: 'Белка', userId: 'u1' })).toBe('Белка')
  })
})

describe('sourceLabel', () => {
  it('переводит известные источники', () => {
    expect(sourceLabel('catalog')).toBe('Каталог')
    expect(sourceLabel('matching')).toBe('Матчинг')
  })

  it('переводит предварительный экран приоритетов', () => {
    expect(sourceLabel('matching_priority_gate')).toBe('Предварительный экран приоритетов')
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

  it('приоритеты без предыдущего снимка показывают полный нумерованный порядок', () => {
    expect(
      eventDetail(event('priorities_updated', { rankedBookTitles: ['Дюна', '1984', 'Мы'] })),
    ).toBe('1. Дюна → 2. 1984 → 3. Мы')
  })

  it('приоритеты с предыдущим снимком показывают только дифф', () => {
    expect(
      eventDetail(event('priorities_updated', {
        previousRankedBookTitles: ['Дюна', '1984', 'Мы'],
        rankedBookTitles: ['1984', 'Дюна', 'Мы'],
      })),
    ).toBe('1984: 2→1, Дюна: 1→2')
  })

  it('приоритеты: пустой предыдущий снимок трактуется как первичная установка', () => {
    expect(
      eventDetail(event('priorities_updated', {
        previousRankedBookTitles: [],
        rankedBookTitles: ['Дюна', '1984'],
      })),
    ).toBe('1. Дюна → 2. 1984')
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

  it('participant_left: самостоятельный выход — тире', () => {
    expect(eventDetail(event('participant_left', { pseudonym: 'Белка' }, null, 'matching'))).toBe('—')
  })

  it('participant_left: удаление админом помечается', () => {
    expect(eventDetail(event('participant_left', { pseudonym: 'Белка' }, null, 'admin'))).toBe('удалён:а админом')
  })

  it('без метаданных показывает bookId или тире', () => {
    expect(eventDetail(event('x', null, 'b1'))).toBe('b1')
    expect(eventDetail(event('x', null, null))).toBe('—')
  })
})

describe('priorityDiff', () => {
  it('перестановка ранга показывает старый→новый', () => {
    expect(priorityDiff(['A', 'B', 'C'], ['B', 'A', 'C'])).toBe('B: 2→1, A: 1→2')
  })

  it('добавленная книга помечается + с новым рангом', () => {
    expect(priorityDiff(['A', 'B'], ['A', 'B', 'C'])).toBe('+C (#3)')
  })

  it('убранная книга помечается −', () => {
    expect(priorityDiff(['A', 'B', 'C'], ['A', 'B'])).toBe('−C')
  })

  it('идентичный порядок → без изменений', () => {
    expect(priorityDiff(['A', 'B'], ['A', 'B'])).toBe('без изменений')
  })

  it('комбинация: добавление, удаление и сдвиг', () => {
    expect(priorityDiff(['A', 'B', 'C'], ['C', 'A', 'D'])).toBe('+D (#3), −B, C: 3→1, A: 1→2')
  })
})
