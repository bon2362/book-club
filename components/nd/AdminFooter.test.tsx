import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AdminFooter from './AdminFooter'

const refresh = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

const allureSummary = {
  statistic: {
    passed: 10,
    failed: 0,
    broken: 0,
    skipped: 0,
    total: 10,
  },
  time: {
    stop: Date.now(),
  },
}

function fetchUrl(index: number) {
  return (global.fetch as jest.Mock).mock.calls[index][0]
}

beforeEach(() => {
  jest.clearAllMocks()
  global.fetch = jest.fn(async (url: string) => {
    if (url === '/api/admin/status') {
      return { ok: true, json: async () => ({ ci: null, deploy: null }) }
    }
    if (url === '/api/admin/digest-status') {
      return { ok: true, json: async () => ({ status: 'empty' }) }
    }
    if (url === '/api/admin/posthog-usage') {
      return { ok: true, json: async () => ({ eventsThisMonth: 123, limit: 1_000_000 }) }
    }
    return { ok: true, json: async () => allureSummary }
  }) as jest.Mock
})

describe('AdminFooter', () => {
  it('обновляет все виджеты одной кнопкой без reload страницы', async () => {
    render(
      <AdminFooter
        buildTime="17.05.2026, 12:00"
        commitSha="abcdef123456"
        shortSha="abcdef1"
        commitMsg="test commit"
      />
    )

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(4)
    })

    const initialUrls = (global.fetch as jest.Mock).mock.calls.slice(0, 4).map(c => c[0])
    expect(initialUrls).toEqual(expect.arrayContaining([
      '/api/admin/status',
      '/api/admin/digest-status',
      'https://bon2362.github.io/book-club/widgets/summary.json',
      '/api/admin/posthog-usage',
    ]))

    fireEvent.click(screen.getByRole('button', { name: /обновить виджеты/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(8)
    })

    expect(refresh).toHaveBeenCalledTimes(1)
    const refreshUrls = (global.fetch as jest.Mock).mock.calls.slice(4, 8).map(c => c[0])
    expect(refreshUrls).toEqual(expect.arrayContaining([
      '/api/admin/status',
      '/api/admin/digest-status',
      'https://bon2362.github.io/book-club/widgets/summary.json',
      '/api/admin/posthog-usage',
    ]))
  })
})
