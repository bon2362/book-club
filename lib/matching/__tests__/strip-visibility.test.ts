import { resolveMatchingStripSessionId } from '../strip-visibility'

describe('resolveMatchingStripSessionId', () => {
  it('показывает полосу вошедшему участнику при открытой сессии', () => {
    expect(resolveMatchingStripSessionId({
      viewerUserId: 'u1', openSessionId: 's1', dismissedSessionId: null,
    })).toBe('s1')
  })

  it('не показывает полосу гостю', () => {
    expect(resolveMatchingStripSessionId({
      viewerUserId: null, openSessionId: 's1', dismissedSessionId: null,
    })).toBeNull()
  })

  it('не показывает полосу между сессиями', () => {
    expect(resolveMatchingStripSessionId({
      viewerUserId: 'u1', openSessionId: null, dismissedSessionId: null,
    })).toBeNull()
  })

  it('не показывает полосу, закрытую для этой же сессии', () => {
    expect(resolveMatchingStripSessionId({
      viewerUserId: 'u1', openSessionId: 's1', dismissedSessionId: 's1',
    })).toBeNull()
  })

  it('возвращает полосу в новом сезоне, даже если прошлый закрывали', () => {
    // Ради этого закрытие и привязано к id сессии, а не к флагу: иначе человек,
    // однажды закрывший полосу, остался бы без единственного входа в матчинг.
    expect(resolveMatchingStripSessionId({
      viewerUserId: 'u1', openSessionId: 's2', dismissedSessionId: 's1',
    })).toBe('s2')
  })
})
