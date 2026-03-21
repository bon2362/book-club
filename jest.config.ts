import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironment: 'jest-environment-jsdom',
  testPathIgnorePatterns: ['/node_modules/', '/.next/', '/e2e/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^transliteration$': '<rootDir>/node_modules/transliteration/dist/node/src/node/index.js',
  },
  clearMocks: true,
  collectCoverageFrom: [
    'lib/**/*.ts',
    '!lib/**/*.test.ts',
    '!lib/db/migrations/**',
  ],
  coverageThreshold: {
    global: {
      lines: 80,
      functions: 80,
    },
  },
}

export default createJestConfig(config)
