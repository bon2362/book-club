/** @jest-environment node */
jest.mock('@/lib/db', () => ({ db: {} }))
jest.mock('@/lib/books', () => ({ fetchBooksByIds: jest.fn() }))
import { searchPublishedBooks } from './repo'

test('searchPublishedBooks не запрашивает каталог для строки короче двух символов', async () => {
  const client = { select: jest.fn() }
  await expect(searchPublishedBooks(' а ', client as never)).resolves.toEqual([])
  expect(client.select).not.toHaveBeenCalled()
})
