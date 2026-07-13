jest.mock('@/lib/db', () => ({ db: {} }))
jest.mock('drizzle-orm', () => ({
  sql: jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
}))

import { enableMatchingLegacyCleanup } from '../legacy-cleanup'

it('sets the cleanup bypass transaction-locally', async () => {
  const execute = jest.fn().mockResolvedValue(undefined)
  await enableMatchingLegacyCleanup({ execute } as never)
  expect(execute).toHaveBeenCalledTimes(1)
  const query = execute.mock.calls[0][0] as { strings: string[] }
  expect(query.strings.join('')).toContain("set_config('app.matching_legacy_cleanup', 'on', true)")
})
