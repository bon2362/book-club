import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { basename } from 'node:path'

const args = process.argv.slice(2)
const optionsWithValues = new Set([
  '--config', '-c', '--grep', '-g', '--grep-invert', '--project',
  '--workers', '-j', '--repeat-each', '--retries', '--timeout',
  '--global-timeout', '--max-failures', '--output', '--reporter',
  '--shard', '--tsconfig',
])
const specArgs = []
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index]
  if (arg === '--') continue
  if (arg.startsWith('-')) {
    const option = arg.split('=', 1)[0]
    if (!arg.includes('=') && optionsWithValues.has(option)) index += 1
    continue
  }
  if (/\.spec\.ts(?::\d+)?$/.test(arg)) specArgs.push(arg)
}
const missingSpecs = specArgs.filter(arg => !existsSync(arg.replace(/:\d+$/, '')))
if (specArgs.length === 0 || missingSpecs.length > 0) {
  console.error('Usage: npm run test:e2e:focused -- <spec> [--grep "scenario"]')
  if (missingSpecs.length > 0) console.error(`Unknown spec: ${missingSpecs.join(', ')}`)
  process.exit(2)
}
if (args.some(arg => arg === '--config' || arg === '-c' || arg.startsWith('--config='))) {
  console.error('Focused runner selects its config from the spec path; do not pass --config.')
  process.exit(2)
}

const matchingSpecs = specArgs.filter(arg => basename(arg.replace(/:\d+$/, '')).startsWith('matching-'))
if (matchingSpecs.length > 0 && matchingSpecs.length !== specArgs.length) {
  console.error('Run Matching and non-Matching focused specs separately.')
  process.exit(2)
}
const configArgs = matchingSpecs.length > 0
  ? ['--config=playwright.matching-manual.config.ts']
  : []

const result = spawnSync(
  process.execPath,
  ['./node_modules/@playwright/test/cli.js', 'test', '--forbid-only', '--retries=0', ...configArgs, ...args],
  { stdio: 'inherit' },
)
process.exit(result.status ?? 1)
