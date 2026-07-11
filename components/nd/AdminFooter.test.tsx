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
    if (url === '/api/admin/neon-usage') {
      return {
        ok: true,
        json: async () => ({
          cuHours: 50.9, estSpendUsd: 5.4, spendLimitUsd: 10,
          periodStart: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-11T00:00:00.000Z',
        }),
      }
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
      expect(global.fetch).toHaveBeenCalledTimes(5)
    })

    const initialUrls = (global.fetch as jest.Mock).mock.calls.slice(0, 5).map(c => c[0])
    expect(initialUrls).toEqual(expect.arrayContaining([
      '/api/admin/status',
      '/api/admin/digest-status',
      'https://bon2362.github.io/book-club/widgets/summary.json',
      '/api/admin/posthog-usage',
      '/api/admin/neon-usage',
    ]))

    fireEvent.click(screen.getByRole('button', { name: /обновить виджеты/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(10)
    })

    expect(refresh).toHaveBeenCalledTimes(1)
    const refreshUrls = (global.fetch as jest.Mock).mock.calls.slice(5, 10).map(c => c[0])
    expect(refreshUrls).toEqual(expect.arrayContaining([
      '/api/admin/status',
      '/api/admin/digest-status',
      'https://bon2362.github.io/book-club/widgets/summary.json',
      '/api/admin/posthog-usage',
      '/api/admin/neon-usage',
    ]))
  })
})
