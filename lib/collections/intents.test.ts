/**
 * @jest-environment jsdom
 */
import { consumeCreateIntent, consumeSignupIntent, saveCreateIntent, saveSignupIntent } from './intents'

beforeEach(() => localStorage.clear())

describe('намерение записаться', () => {
  it('отдаётся один раз и только своей подборке', () => {
    saveSignupIntent({ collectionRef: 'tema', bookId: 'b1' })
    expect(consumeSignupIntent('other')).toBeNull()
    expect(consumeSignupIntent('tema')).toBe('b1')
    expect(consumeSignupIntent('tema')).toBeNull()
  })

  it('устаревает через 30 минут', () => {
    saveSignupIntent({ collectionRef: 'tema', bookId: 'b1' })
    expect(consumeSignupIntent('tema', Date.now() + 31 * 60_000)).toBeNull()
  })

  it('битое значение не ломает страницу', () => {
    localStorage.setItem('collectionSignupIntent', '{')
    expect(consumeSignupIntent('tema')).toBeNull()
  })
})

describe('намерение собрать подборку', () => {
  it('отдаётся один раз', () => {
    saveCreateIntent()
    expect(consumeCreateIntent()).toBe(true)
    expect(consumeCreateIntent()).toBe(false)
  })
})
