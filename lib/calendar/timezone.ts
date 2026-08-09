const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Смещение зоны относительно UTC в миллисекундах для конкретного момента.
 * Считается через Intl, поэтому переход на летнее время учитывается сам.
 */
export function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)

  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? '0')
  const asUtc = Date.UTC(read('year'), read('month') - 1, read('day'), read('hour') % 24, read('minute'), read('second'))
  return asUtc - instant.getTime()
}

/**
 * Момент местной полуночи того дня, в который попадает instant.
 * Второй проход нужен на границе перевода часов: смещение самого момента и
 * смещение получившейся полуночи могут отличаться на час.
 */
export function startOfLocalDay(instant: Date, timeZone: string): Date {
  const offset = zoneOffsetMs(instant, timeZone)
  const local = new Date(instant.getTime() + offset)
  const midnightAsUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())
  const firstGuess = new Date(midnightAsUtc - offset)
  return new Date(midnightAsUtc - zoneOffsetMs(firstGuess, timeZone))
}

/**
 * Прибавляет календарные дни, а не 24 часа. Якорь в полдень защищает от
 * суток длиной 23 и 25 часов: простое прибавление 24 часов в такие дни
 * промахивается мимо следующей полуночи.
 */
export function addLocalDays(dayStart: Date, count: number, timeZone: string): Date {
  return startOfLocalDay(new Date(dayStart.getTime() + count * DAY_MS + DAY_MS / 2), timeZone)
}

/** Ключ местной календарной даты, YYYY-MM-DD — для раскладки слотов по колонкам. */
export function localDayKey(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant)
}

export function formatInZone(
  instant: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat('ru', { ...options, timeZone }).format(instant)
}

/** Пояс браузера или null, если среда его не сообщает. */
export function detectBrowserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    return null
  }
}

/**
 * Пояс смотрящего: сохранённый в профиле, иначе определённый браузером, иначе UTC.
 * Вызывать только на клиенте после монтирования: на сервере браузерная ветка
 * вернёт пояс сервера, и гидратация уже не перепишет отрисованные подписи.
 */
export function resolveViewerTimeZone(stored: string | null | undefined): string {
  return stored || detectBrowserTimeZone() || 'UTC'
}
