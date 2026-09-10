/**
 * @jest-environment node
 */
import { readdirSync } from 'fs'
import { join } from 'path'

/**
 * Миграции применяются вручную по имени файла, поэтому совпадение номеров не ломает
 * прод — но делает двусмысленной каждую ссылку вида «миграция 0062» в документации
 * и в разговоре. Такой дубль уже доезжал до main (0062_calendar и
 * 0062_partial_matching_completion), и заметили его только при разборе руками.
 */
/**
 * Единственный исторический дубль: две независимые миграции марта 2026 получили номер
 * 0043. Обе давно применены, таблицы создают разные и друг от друга не зависят.
 * Переименование сдвинуло бы их в конец очереди и соврало бы про порядок появления,
 * поэтому дубль заморожен как есть — правило действует на всё новое.
 */
const KNOWN_DUPLICATES = ['0043']

describe('нумерация миграций', () => {
  const files = readdirSync(join(process.cwd(), 'drizzle')).filter((name) => name.endsWith('.sql'))

  it('находит миграции', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('даёт каждой миграции уникальный номер', () => {
    const byNumber = new Map<string, string[]>()
    for (const file of files) {
      const number = /^(\d+)_/.exec(file)?.[1]
      if (!number) continue
      byNumber.set(number, [...(byNumber.get(number) ?? []), file])
    }
    const duplicates = Array.from(byNumber.entries())
      .filter(([number, names]) => names.length > 1 && !KNOWN_DUPLICATES.includes(number))
      .map(([number, names]) => `${number}: ${names.join(', ')}`)

    expect(duplicates).toEqual([])
  })

  it('не расширяет список исторических дублей', () => {
    const actualDuplicates = files.reduce<Map<string, number>>((counts, file) => {
      const number = /^(\d+)_/.exec(file)?.[1]
      if (number) counts.set(number, (counts.get(number) ?? 0) + 1)
      return counts
    }, new Map())
    const stale = KNOWN_DUPLICATES.filter((number) => (actualDuplicates.get(number) ?? 0) < 2)

    // Если дубль разошёлся — вычеркни номер из KNOWN_DUPLICATES, чтобы список не
    // превратился в свалку разрешений на будущие дубли.
    expect(stale).toEqual([])
  })

  it('называет каждую миграцию по образцу <номер>_<имя>.sql', () => {
    expect(files.filter((file) => !/^\d{4}_[a-z0-9_]+\.sql$/.test(file))).toEqual([])
  })
})
