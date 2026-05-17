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
      expect(global.fetch).toHaveBeenCalledTimes(3)
    })

    expect(fetchUrl(0)).toBe('/api/admin/status')
    expect(fetchUrl(1)).toBe('/api/admin/digest-status')
    expect(fetchUrl(2)).toBe('https://bon2362.github.io/book-club/widgets/summary.json')

    fireEvent.click(screen.getByRole('button', { name: /обновить виджеты/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(6)
    })

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(fetchUrl(3)).toBe('/api/admin/status')
    expect(fetchUrl(4)).toBe('/api/admin/digest-status')
    expect(fetchUrl(5)).toBe('https://bon2362.github.io/book-club/widgets/summary.json')
  })
})
