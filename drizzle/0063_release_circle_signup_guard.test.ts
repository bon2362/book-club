import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('0063 release-circle signup guard', () => {
  const sql = readFileSync(
    join(process.cwd(), 'drizzle/0063_release_circle_signup_guard.sql'),
    'utf8',
  )

  it('allows only a transaction explicitly marked as an administrative circle release', () => {
    expect(sql).toContain("current_setting('app.matching_release_circle', true) = 'on'")
    expect(sql).toContain('RETURN NEW;')
    expect(sql).toContain('current matching hard choice or assignment protects this shortlist book')
  })
})
