import { buildSlug, slugifyTitle } from '@/lib/calendar/slug'

describe('slug', () => {
  it('transliterates Cyrillic', () => {
    expect(slugifyTitle('Заря всего')).toBe('zarya-vsego')
    expect(slugifyTitle('Щи и ёж')).toBe('shchi-i-yozh')
  })

  it('drops punctuation and collapses separators', () => {
    expect(slugifyTitle('Дом  листьев: роман!')).toBe('dom-listev-roman')
    expect(slugifyTitle('  Игра в бисер  ')).toBe('igra-v-biser')
  })

  it('keeps latin letters and digits', () => {
    expect(slugifyTitle('Fahrenheit 451')).toBe('fahrenheit-451')
  })

  it('never returns an empty string', () => {
    expect(slugifyTitle('«…»')).toBe('krug')
  })

  it('uses the bare slug for the first circle and the position for later circles', () => {
    expect(buildSlug('Заря всего', 1, new Set())).toBe('zarya-vsego')
    expect(buildSlug('Заря всего', 2, new Set())).toBe('zarya-vsego-2')
  })

  it('skips occupied addresses', () => {
    expect(buildSlug('Заря всего', 1, new Set(['zarya-vsego']))).toBe('zarya-vsego-2')
    expect(buildSlug('Заря всего', 2, new Set(['zarya-vsego-2']))).toBe('zarya-vsego-3')
  })
})
