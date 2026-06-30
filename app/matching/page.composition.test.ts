import fs from 'node:fs'
import path from 'node:path'

test('matching page owns one shared satisfaction flow for gate and board phases', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'app/matching/page.tsx'), 'utf8')
  expect(source.match(/<MatchingSatisfactionFlow/g)).toHaveLength(1)
  expect(source).toContain('phase={showRankingGate ? \'gate\' : \'board\'}')
  expect(source).toContain('if (!showRankingGate)')
  expect(source).toContain('const bookTitleById = showRankingGate')
  expect(source).toContain('workspace={showRankingGate ? undefined :')
})
