import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironment: 'jest-environment-jsdom',
  testPathIgnorePatterns: ['/node_modules/', '/.next/', '/e2e/', '/.claude/worktrees/'],
  modulePathIgnorePatterns: ['<rootDir>/.claude/worktrees/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^transliteration$': '<rootDir>/node_modules/transliteration/dist/node/src/node/index.js',
    // jsdom selects cheerio's ESM "browser" build; pin the slim CommonJS entry
    // for Jest (slim omits the undici-based fromURL helper we never use).
    '^cheerio$': '<rootDir>/node_modules/cheerio/dist/commonjs/slim.js',
  },
  clearMocks: true,
  collectCoverageFrom: [
    'lib/**/*.ts',
    'app/api/**/*.ts',
    '!lib/**/*.test.ts',
    '!app/api/**/*.test.ts',
    '!lib/db/migrations/**',
    '!lib/db/schema.ts',
    '!lib/db/index.ts',
    '!lib/analytics.ts',
    '!app/api/test/**',
    '!app/api/auth/[...nextauth]/**',
  ],
  coverageThreshold: {
    global: {
      lines: 80,
      functions: 80,
    },
  },
}

export default createJestConfig(config)
