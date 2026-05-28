import { touch, remove, getOnline } from '../presence'

jest.mock('../hub', () => ({
  broadcast: jest.fn(),
}))

describe('presence', () => {
  const sid = 'presence-test-session'

  beforeEach(() => {
    // Clear state by removing all users
    // Since we can't reset the module, each test uses a unique session
  })

  it('touch adds user to online set', () => {
    const s = `${sid}-1`
    touch(s, 'u1', 'Барсук')
    expect(getOnline(s)).toContain('Барсук')
  })

  it('remove takes user off online set', () => {
    const s = `${sid}-2`
    touch(s, 'u1', 'Выдра')
    remove(s, 'u1')
    expect(getOnline(s)).not.toContain('Выдра')
  })

  it('multiple users all online', () => {
    const s = `${sid}-3`
    touch(s, 'u1', 'Лис')
    touch(s, 'u2', 'Волк')
    touch(s, 'u3', 'Рысь')
    const online = getOnline(s)
    expect(online).toContain('Лис')
    expect(online).toContain('Волк')
    expect(online).toContain('Рысь')
  })

  it('getOnline returns empty for unknown session', () => {
    expect(getOnline('no-such-session-xyz')).toEqual([])
  })
})
