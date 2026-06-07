import { declinePseudonym, pseudonymPronoun } from '../pseudonym-declension'

describe('declinePseudonym', () => {
  it('returns dative for Барсук', () => {
    expect(declinePseudonym('Барсук', 'dat')).toBe('Барсуку')
  })

  it('returns dative for Белка (feminine)', () => {
    expect(declinePseudonym('Белка', 'dat')).toBe('Белке')
  })

  it('returns dative for Лягушка', () => {
    expect(declinePseudonym('Лягушка', 'dat')).toBe('Лягушке')
  })

  it('returns nominative as fallback for unknown name', () => {
    expect(declinePseudonym('Единорог', 'dat')).toBe('Единорог')
  })

  it('returns genitive for Журавль', () => {
    expect(declinePseudonym('Журавль', 'gen')).toBe('Журавля')
  })
})

describe('pseudonymPronoun', () => {
  it('returns он for masculine', () => {
    expect(pseudonymPronoun('Барсук', 'он')).toBe('он')
  })

  it('returns она for feminine', () => {
    expect(pseudonymPronoun('Белка', 'он')).toBe('она')
  })

  it('returns ему for masculine dative', () => {
    expect(pseudonymPronoun('Барсук', 'ему')).toBe('ему')
  })

  it('returns ей for feminine dative', () => {
    expect(pseudonymPronoun('Белка', 'ему')).toBe('ей')
  })

  it('returns его for masculine genitive', () => {
    expect(pseudonymPronoun('Барсук', 'его')).toBe('его')
  })

  it('returns её for feminine genitive', () => {
    expect(pseudonymPronoun('Белка', 'его')).toBe('её')
  })

  it('returns он as fallback for unknown name', () => {
    expect(pseudonymPronoun('Единорог', 'он')).toBe('он')
  })
})
