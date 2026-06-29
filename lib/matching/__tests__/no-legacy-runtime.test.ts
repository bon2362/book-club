/**
 * Regression guard: ensures that legacy matching concepts do not re-enter the
 * runtime codebase. If this test fails, check if one of the patterns below was
 * accidentally re-introduced.
 *
 * Excluded from scan:
 *  - docs/superpowers/** (specs and plans reference historical concepts)
 *  - This test file itself
 */

import { execFileSync } from 'child_process'
import path from 'path'

const ROOT = path.resolve(__dirname, '../../..')

function rg(pattern: string, dirs: string[]): string[] {
  try {
    const result = execFileSync('rg', [
      '-rn',
      '--glob', '*.{ts,tsx}',
      '--glob', '!**/*.test.ts',
      '--glob', '!**/*.test.tsx',
      '-e', pattern,
      ...dirs.map((dir) => path.join(ROOT, dir)),
    ], { encoding: 'utf8', cwd: ROOT })
    return result.trim().split('\n').filter(Boolean)
  } catch {
    // rg exits with code 1 when no matches found (that's what we want)
    return []
  }
}

const RUNTIME_DIRS = ['app', 'components', 'lib']

describe('no-legacy-matching-runtime', () => {
  it('does not reference optimizationMode in runtime code', () => {
    const hits = rg('optimizationMode', RUNTIME_DIRS).filter(
      (line) => !line.includes('lib/db/schema.ts'),
    )
    expect(hits).toHaveLength(0)
  })

  it('does not reference pseudonym DTO fields (pseudonym key/value) in runtime matching code', () => {
    // Exclude admin gallery (species photos) and matching-shared (historical token)
    const hits = rg('pseudonym:', ['lib/matching', 'app/matching', 'app/api/matching']).filter(
      (line) => !line.includes('no-legacy-runtime.test.ts'),
    )
    expect(hits).toHaveLength(0)
  })

  it('does not reference coverage optimization branch in matching runtime', () => {
    // The word "coverage" in optimizer context, not in comments
    const hits = rg("mode.*['\"]coverage['\"]|['\"]coverage['\"].*mode", ['lib/matching/scenarios.ts', 'app/matching']).filter(
      (line) => !line.includes('no-legacy-runtime.test.ts'),
    )
    expect(hits).toHaveLength(0)
  })

  it('does not import deleted my-moves or move-impact modules', () => {
    const hits = rg("from.*matching/my-moves|from.*matching/move-impact", RUNTIME_DIRS).filter(
      (line) => !line.includes('no-legacy-runtime.test.ts'),
    )
    expect(hits).toHaveLength(0)
  })

  it('does not import deleted pseudonym modules', () => {
    const hits = rg("from.*pseudonym-reservations|from.*pseudonym-illustrations", RUNTIME_DIRS).filter(
      (line) => !line.includes('no-legacy-runtime.test.ts'),
    )
    expect(hits).toHaveLength(0)
  })

  it('does not import deleted preference-event-display module', () => {
    const hits = rg("from.*preference-event-display", RUNTIME_DIRS).filter(
      (line) => !line.includes('no-legacy-runtime.test.ts'),
    )
    expect(hits).toHaveLength(0)
  })
})
