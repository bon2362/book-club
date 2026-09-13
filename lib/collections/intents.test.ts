/** @jest-environment jsdom */
import { consumeCreateIntent, consumeSignupIntent, saveCreateIntent, saveSignupIntent } from './intents'
beforeEach(() => localStorage.clear())
test('намерение записи выдаётся раз и только своей подборке', () => { saveSignupIntent({ collectionRef: 'tema', bookId: 'b1' }); expect(consumeSignupIntent('other')).toBeNull(); expect(consumeSignupIntent('tema')).toBe('b1'); expect(consumeSignupIntent('tema')).toBeNull() })
test('намерение записи устаревает', () => { saveSignupIntent({ collectionRef: 'tema', bookId: 'b1' }); expect(consumeSignupIntent('tema', Date.now() + 31 * 60_000)).toBeNull() })
test('битое намерение не ломает страницу', () => { localStorage.setItem('collectionSignupIntent', '{'); expect(consumeSignupIntent('tema')).toBeNull() })
test('намерение собрать выдаётся раз', () => { saveCreateIntent(); expect(consumeCreateIntent()).toBe(true); expect(consumeCreateIntent()).toBe(false) })
