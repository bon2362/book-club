import fs from 'fs'
import path from 'path'

test('RSC book-participant props never use a raw user id as a display-name fallback', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'app/matching/page.tsx'), 'utf8')
  expect(source).not.toMatch(/displayName:[^\n]*\?\?\s*row\.userId/)
  expect(source).toContain('assignMatchingDisplayNames')
})
