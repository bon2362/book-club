import { slugifyTitle, uniqueSlug } from '@/lib/slug'

describe('slugifyTitle', () => {
  it('транслитерирует и схлопывает разделители', () => {
    expect(slugifyTitle('Как государство научилось видеть')).toBe('kak-gosudarstvo-nauchilos-videt')
  })

  it('возвращает запасной адрес для пустого результата', () => {
    expect(slugifyTitle('!!!', 'podborka')).toBe('podborka')
    expect(slugifyTitle('')).toBe('krug')
  })
})

describe('uniqueSlug', () => {
  it('оставляет свободный адрес', () => {
    expect(uniqueSlug('istoriya', new Set())).toBe('istoriya')
  })

  it('добавляет суффикс -2, -3 при занятости', () => {
    expect(uniqueSlug('istoriya', new Set(['istoriya', 'istoriya-2']))).toBe('istoriya-3')
  })

  it('обходит зарезервированные адреса', () => {
    expect(uniqueSlug('new', new Set(), new Set(['new']))).toBe('new-2')
  })
})
