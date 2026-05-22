import { getContactEmail, getUserContactEmail, isSyntheticTelegramEmail } from './user-email'

describe('user email helpers', () => {
  describe('isSyntheticTelegramEmail', () => {
    it('распознаёт технический email Telegram-only пользователя', () => {
      expect(isSyntheticTelegramEmail('telegram:123456@telegram.user')).toBe(true)
      expect(isSyntheticTelegramEmail(' telegram:abc-def@telegram.user ')).toBe(true)
    })

    it('не считает обычные адреса синтетическими', () => {
      expect(isSyntheticTelegramEmail('reader@example.com')).toBe(false)
      expect(isSyntheticTelegramEmail('telegram-user@example.com')).toBe(false)
      expect(isSyntheticTelegramEmail(null)).toBe(false)
    })
  })

  describe('getContactEmail', () => {
    it('возвращает обычный email без внешних пробелов', () => {
      expect(getContactEmail(' reader@example.com ')).toBe('reader@example.com')
    })

    it('возвращает null для пустого и синтетического email', () => {
      expect(getContactEmail('')).toBeNull()
      expect(getContactEmail(null)).toBeNull()
      expect(getContactEmail('telegram:123456@telegram.user')).toBeNull()
    })
  })

  describe('getUserContactEmail', () => {
    it('предпочитает явный contactEmail', () => {
      expect(getUserContactEmail({ contactEmail: 'contact@example.com', email: 'legacy@example.com' })).toBe('contact@example.com')
    })

    it('использует legacy email только если он реальный', () => {
      expect(getUserContactEmail({ contactEmail: null, email: 'legacy@example.com' })).toBe('legacy@example.com')
      expect(getUserContactEmail({ contactEmail: null, email: 'telegram:123@telegram.user' })).toBeNull()
    })
  })
})
