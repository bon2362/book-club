// Deterministic E2E fixture books. Imported by /api/test/seed-books to upsert
// them into the DB at the start of a Playwright run, and to remove them at the
// end. Kept in a plain library module so the route handler only exports valid
// Next.js route fields.
export const TEST_FIXTURE_BOOKS = [
  { id: '__test_book_1__', title: 'Тестовая книга 1', author: 'Test Author A', tags: ['государство'] as string[], description: 'Книга для e2e-тестов', pages: 100, publishedDate: '2024' },
  { id: '__test_book_2__', title: 'Тестовая книга 2', author: 'Test Author B', tags: [] as string[], description: 'Книга для e2e-тестов', pages: 200, publishedDate: '2024' },
  { id: '__test_book_3__', title: 'Тестовая книга 3', author: 'Test Author C', tags: [] as string[], description: 'Книга для e2e-тестов', pages: 300, publishedDate: '2024' },
]

export const TEST_FIXTURE_BOOK_IDS = TEST_FIXTURE_BOOKS.map(b => b.id)
export const TEST_FIXTURE_BOOK_TITLES = TEST_FIXTURE_BOOKS.map(b => b.title)
