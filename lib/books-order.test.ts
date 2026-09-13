import { orderRowsByIds } from './books'
jest.mock('@/lib/db', () => ({ db: {} }))
test('orderRowsByIds сохраняет порядок и пропускает отсутствующие', () => expect(orderRowsByIds(['a', 'x', 'b'], new Map([['b', { id: 'b' }], ['a', { id: 'a' }]]))).toEqual([{ id: 'a' }, { id: 'b' }]))
