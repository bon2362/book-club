import {
  formatMatchingEvent,
  matchingEventTypeLabel,
  matchingSourceLabel,
  formatMatchingActor,
  formatMatchingSubject,
  type MatchingEventLike,
} from '../matching-event-display'

function event(
  eventType: string,
  overrides: Partial<MatchingEventLike> = {},
): MatchingEventLike {
  return {
    eventType,
    actorUserId: 'actor-1',
    actorNameSnapshot: 'Актор',
    subjectUserId: null,
    subjectNameSnapshot: null,
    source: 'matching',
    bookId: null,
    before: null,
    after: null,
    metadata: null,
    ...overrides,
  }
}

describe('matchingEventTypeLabel', () => {
  it('переводит join-события', () => {
    expect(matchingEventTypeLabel('self_join')).toBe('Вход в сессию')
    expect(matchingEventTypeLabel('admin_add')).toBe('Добавлен:а админом')
    expect(matchingEventTypeLabel('leave')).toBe('Покинул:а сессию')
    expect(matchingEventTypeLabel('admin_remove')).toBe('Удалён:а админом')
  })

  it('переводит confirmation-события', () => {
    expect(matchingEventTypeLabel('confirmation_created')).toBe('Подтверждение круга')
    expect(matchingEventTypeLabel('confirmation_switched')).toBe('Смена подтверждения')
    expect(matchingEventTypeLabel('confirmation_cancelled')).toBe('Отмена подтверждения')
    expect(matchingEventTypeLabel('confirmation_transferred')).toBe('Перенос подтверждения')
    expect(matchingEventTypeLabel('confirmation_invalidated')).toBe('Аннулирование подтверждения')
  })

  it('переводит circle-события', () => {
    expect(matchingEventTypeLabel('circle_locked')).toBe('Круг закреплён')
    expect(matchingEventTypeLabel('dissolve_circle')).toBe('Круг распущен')
    expect(matchingEventTypeLabel('freeze')).toBe('Сессия зафиксирована')
  })

  it('переводит preference-события', () => {
    expect(matchingEventTypeLabel('change_book')).toBe('Изменение книги')
    expect(matchingEventTypeLabel('change_rank')).toBe('Ранг изменён')
    expect(matchingEventTypeLabel('change_status')).toBe('Статус чтения изменён')
    expect(matchingEventTypeLabel('replace_signup')).toBe('Список книг обновлён')
    expect(matchingEventTypeLabel('reorder_priorities')).toBe('Перестановка приоритетов')
    expect(matchingEventTypeLabel('change_group_size')).toBe('Изменение размера групп')
  })

  it('возвращает исходный код для неизвестного типа', () => {
    expect(matchingEventTypeLabel('unknown_event')).toBe('unknown_event')
  })
})

describe('matchingSourceLabel', () => {
  it('переводит известные источники', () => {
    expect(matchingSourceLabel('matching')).toBe('Матчинг')
    expect(matchingSourceLabel('admin')).toBe('Админка')
    expect(matchingSourceLabel('catalog')).toBe('Каталог')
    expect(matchingSourceLabel('profile')).toBe('Профиль')
    expect(matchingSourceLabel('system')).toBe('Система')
    expect(matchingSourceLabel('cron')).toBe('Автоматически')
  })

  it('возвращает исходный код для неизвестного источника', () => {
    expect(matchingSourceLabel('webhook')).toBe('webhook')
  })
})

describe('formatMatchingActor', () => {
  it('возвращает имя из снимка', () => {
    expect(formatMatchingActor(event('self_join'))).toBe('Актор')
  })

  it('возвращает короткий id при отсутствии снимка', () => {
    const e = event('self_join', { actorNameSnapshot: null, actorUserId: 'abcdef123456xxxx' })
    expect(formatMatchingActor(e)).toBe('abcdef123456…')
  })

  it('возвращает «—» при отсутствии actor', () => {
    const e = event('freeze', { actorUserId: null, actorNameSnapshot: null })
    expect(formatMatchingActor(e)).toBe('—')
  })
})

describe('formatMatchingSubject', () => {
  it('возвращает имя субъекта', () => {
    const e = event('admin_add', { subjectUserId: 'u-2', subjectNameSnapshot: 'Иван' })
    expect(formatMatchingSubject(e)).toBe('Иван')
  })

  it('возвращает «—» если субъект не задан', () => {
    expect(formatMatchingSubject(event('freeze'))).toBe('—')
  })
})

describe('formatMatchingEvent — detail', () => {
  it('join — упоминает участника если задан субъект', () => {
    const e = event('self_join', { subjectUserId: 'u-1', subjectNameSnapshot: 'Анна' })
    expect(formatMatchingEvent(e)).toContain('Анна')
  })

  it('admin_add — отображает субъекта', () => {
    const e = event('admin_add', { subjectUserId: 'u-1', subjectNameSnapshot: 'Пётр' })
    expect(formatMatchingEvent(e)).toContain('Пётр')
  })

  it('leave — корректно отображается', () => {
    const e = event('leave', { subjectUserId: 'u-1', subjectNameSnapshot: 'Мария' })
    expect(formatMatchingEvent(e)).toBeTruthy()
  })

  it('change_book add — показывает название книги', () => {
    const e = event('change_book', {
      metadata: { operation: 'add', bookTitle: 'Война и мир' },
    })
    expect(formatMatchingEvent(e)).toContain('Война и мир')
    expect(formatMatchingEvent(e)).toContain('+')
  })

  it('change_book remove — показывает название книги со знаком минус', () => {
    const e = event('change_book', {
      metadata: { operation: 'remove', bookTitle: 'Преступление и наказание' },
    })
    expect(formatMatchingEvent(e)).toContain('Преступление и наказание')
    expect(formatMatchingEvent(e)).toContain('−')
  })

  it('change_rank — показывает новый ранг', () => {
    const e = event('change_rank', {
      after: { rank: 2 },
      metadata: { bookTitle: 'Идиот' },
    })
    expect(formatMatchingEvent(e)).toContain('Идиот')
    expect(formatMatchingEvent(e)).toContain('2')
  })

  it('change_rank — показывает «удалён» при null ранге', () => {
    const e = event('change_rank', {
      after: { rank: null },
      metadata: { bookTitle: 'Идиот' },
    })
    expect(formatMatchingEvent(e)).toMatch(/удалён|убран/i)
  })

  it('change_status — показывает книгу и новый статус', () => {
    const e = event('change_status', {
      after: { status: 'read' },
      metadata: { bookTitle: 'Идиот' },
    })
    expect(formatMatchingEvent(e)).toContain('Идиот')
    expect(formatMatchingEvent(e)).toContain('прочитана')
  })

  it('replace_signup — показывает новый список книг', () => {
    const e = event('replace_signup', {
      after: { rankedBookTitles: ['Идиот', 'Обломов'] },
    })
    expect(formatMatchingEvent(e)).toContain('Идиот')
    expect(formatMatchingEvent(e)).toContain('Обломов')
  })

  it('reorder_priorities — показывает новый порядок', () => {
    const e = event('reorder_priorities', {
      after: { rankedBookTitles: ['Анна Каренина', 'Война и мир'] },
    })
    const result = formatMatchingEvent(e)
    expect(result).toContain('Анна Каренина')
    expect(result).toContain('Война и мир')
  })

  it('change_group_size — показывает размер', () => {
    const e = event('change_group_size', {
      after: { minGroupSize: 2, maxGroupSize: 4 },
    })
    expect(formatMatchingEvent(e)).toMatch(/2.+4|2–4/)
  })

  it('confirmation_created — показывает книгу', () => {
    const e = event('confirmation_created', { metadata: { bookTitle: 'Братья Карамазовы' } })
    expect(formatMatchingEvent(e)).toContain('Братья Карамазовы')
  })

  it('confirmation_transferred — отмечает автоматический перенос', () => {
    const e = event('confirmation_transferred', {
      metadata: { automatic: true, bookTitle: 'Идиот' },
    })
    const result = formatMatchingEvent(e)
    expect(result).toMatch(/авто|автоматически/i)
  })

  it('confirmation_invalidated — отмечает автоматическое аннулирование', () => {
    const e = event('confirmation_invalidated', { metadata: { automatic: true } })
    const result = formatMatchingEvent(e)
    expect(result).toMatch(/авто|автоматически/i)
  })

  it('circle_locked — отмечает автоматическое закрепление', () => {
    const e = event('circle_locked', {
      metadata: { automatic: true, bookTitle: 'Мастер и Маргарита' },
    })
    const result = formatMatchingEvent(e)
    expect(result).toMatch(/авто|автоматически/i)
    expect(result).toContain('Мастер и Маргарита')
  })

  it('dissolve_circle — показывает причину', () => {
    const e = event('dissolve_circle', {
      metadata: { reason: 'Конфликт в группе', bookTitle: 'Обломов' },
    })
    const result = formatMatchingEvent(e)
    expect(result).toContain('Конфликт в группе')
  })

  it('freeze — лаконичное описание', () => {
    const e = event('freeze')
    expect(formatMatchingEvent(e)).toBeTruthy()
    expect(formatMatchingEvent(e).length).toBeGreaterThan(0)
  })

  it('неизвестный тип — не падает, возвращает строку', () => {
    const e = event('mystery_event')
    expect(typeof formatMatchingEvent(e)).toBe('string')
  })
})
