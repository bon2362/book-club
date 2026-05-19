import { formatTelegramDisplay, normalizeTelegramContact } from './telegram-display'

describe('telegram display helpers', () => {
  it('нормализует username, @username и t.me links', () => {
    expect(normalizeTelegramContact('reader_2026')).toBe('reader_2026')
    expect(normalizeTelegramContact('@reader_2026')).toBe('reader_2026')
    expect(normalizeTelegramContact('https://t.me/reader_2026')).toBe('reader_2026')
    expect(normalizeTelegramContact('t.me/reader_2026?start=club')).toBe('reader_2026')
  })

  it('отбрасывает email, synthetic Telegram email и произвольный текст', () => {
    expect(normalizeTelegramContact('reader@test.com')).toBeNull()
    expect(normalizeTelegramContact('telegram:123@telegram.user')).toBeNull()
    expect(normalizeTelegramContact('напишите мне в личку')).toBeNull()
  })

  it('форматирует telegram_username раньше contacts', () => {
    expect(formatTelegramDisplay({ telegramUsername: 'reader_main', contacts: '@reader_old' })).toBe('@reader_main')
    expect(formatTelegramDisplay({ contacts: '@reader_old' })).toBe('@reader_old')
    expect(formatTelegramDisplay({ contacts: 'reader@test.com' })).toBe('')
  })
})
