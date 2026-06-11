import { withAdminName } from './matching-shared'

describe('withAdminName (#341 — имена для админа)', () => {
  it('без карты (обычный пользователь) возвращает чистый псевдоним', () => {
    expect(withAdminName('Барсук', null)).toBe('Барсук')
    expect(withAdminName('Барсук', undefined)).toBe('Барсук')
  })

  it('для админа дописывает имя в скобках', () => {
    const map = new Map<string, string | null>([['Барсук', 'Иван Иванов']])
    expect(withAdminName('Барсук', map)).toBe('Барсук (Иван Иванов)')
  })

  it('если имя пустое/нет в карте — только псевдоним', () => {
    const map = new Map<string, string | null>([['Барсук', null]])
    expect(withAdminName('Барсук', map)).toBe('Барсук')
    expect(withAdminName('Белка', map)).toBe('Белка')
  })
})
