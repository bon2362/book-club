import {
  declinePseudonym,
  pseudonymGender,
  pseudonymPastVerb,
  pseudonymPronoun,
} from '../pseudonym-declension'

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

describe('pseudonymGender', () => {
  it('returns м for masculine animal', () => {
    expect(pseudonymGender('Барсук')).toBe('м')
  })

  it('returns ж for feminine animal', () => {
    expect(pseudonymGender('Белка')).toBe('ж')
  })

  it('falls back to м for unknown name', () => {
    expect(pseudonymGender('Единорог')).toBe('м')
  })
})

describe('pseudonymPastVerb (Лента, без гендергепов)', () => {
  const forms = { m: 'добавил', f: 'добавила', n: 'добавило' }

  it('picks masculine form for masculine animal', () => {
    expect(pseudonymPastVerb('Барсук', forms)).toBe('добавил')
  })

  it('picks feminine form for feminine animal', () => {
    expect(pseudonymPastVerb('Белка', forms)).toBe('добавила')
  })

  it('falls back to masculine form for unknown name', () => {
    expect(pseudonymPastVerb('Единорог', forms)).toBe('добавил')
  })

  it('renders "остался / осталась за бортом" по роду', () => {
    const leftout = { m: 'остался', f: 'осталась', n: 'осталось' }
    expect(`Барсук ${pseudonymPastVerb('Барсук', leftout)}`).toBe('Барсук остался')
    expect(`Белка ${pseudonymPastVerb('Белка', leftout)}`).toBe('Белка осталась')
  })
})
