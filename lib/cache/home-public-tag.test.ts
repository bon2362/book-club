jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }))

import { revalidateTag } from 'next/cache'
import { HOME_PUBLIC_TAG, invalidateHomePublicCache } from './home-public-tag'

const revalidate = revalidateTag as jest.Mock

describe('invalidateHomePublicCache', () => {
  beforeEach(() => revalidate.mockReset())

  it('сбрасывает кэш по метке главной', () => {
    invalidateHomePublicCache()
    expect(revalidate).toHaveBeenCalledWith(HOME_PUBLIC_TAG)
  })

  it('не падает вне запроса Next.js (скрипты, задачи по расписанию)', () => {
    revalidate.mockImplementation(() => {
      throw new Error('Invariant: static generation store missing in revalidateTag home-public')
    })
    expect(() => invalidateHomePublicCache()).not.toThrow()
  })
})
