/**
 * @jest-environment jsdom
 */
import { render } from '@testing-library/react'

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
jest.mock('next/navigation', () => ({ notFound: jest.fn() }))
jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/timeline/queries', () => ({ fetchTimelineBySlug: jest.fn() }))
jest.mock('@/components/nd/timeline/TimelineView', () => ({ __esModule: true, default: () => null }))

import { auth } from '@/lib/auth'
import { fetchTimelineBySlug } from '@/lib/timeline/queries'
import TimelinePage from './page'

const timeline = {
  id: 'tl-1',
  slug: 'istoriya',
  title: 'История',
  description: '',
  published: true,
  viewportStart: null,
  viewportEnd: null,
  filterTypeIds: [],
  epochsVisible: true,
  showAll: false,
  events: [],
  epochs: [],
  libraryEvents: [],
  libraryEpochs: [],
}

describe('/timeline/[slug] library boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(fetchTimelineBySlug as jest.Mock).mockResolvedValue(timeline)
  })

  it('не включает общую базу для гостя', async () => {
    ;(auth as jest.Mock).mockResolvedValue(null)

    render(await TimelinePage({ params: { slug: 'istoriya' } }))

    expect(fetchTimelineBySlug).toHaveBeenCalledWith('istoriya', { includeLibrary: false })
  })

  it('включает общую базу только из серверной admin-сессии', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { isAdmin: true } })

    render(await TimelinePage({ params: { slug: 'istoriya' } }))

    expect(fetchTimelineBySlug).toHaveBeenCalledWith('istoriya', { includeLibrary: true })
  })
})
