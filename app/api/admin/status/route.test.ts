/**
 * @jest-environment node
 */
import { GET } from './route'
import * as authModule from '@/lib/auth'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))

const mockAuth = authModule.auth as jest.Mock

const mockFetch = jest.fn()
global.fetch = mockFetch

beforeEach(() => {
  delete process.env.GH_TOKEN
  delete process.env.VERCEL_TOKEN
  mockFetch.mockReset()
})

describe('GET /api/admin/status', () => {
  it('возвращает 403 без сессии', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('возвращает 403 если isAdmin=false', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: false } })
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('возвращает ci=null и deploy=null без токенов', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })

    const res = await GET()
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ci).toBeNull()
    expect(data.deploy).toBeNull()
  })

  it('возвращает ci данные при наличии GH_TOKEN', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    process.env.GH_TOKEN = 'gh-test-token'

    const run = {
      status: 'completed',
      conclusion: 'success',
      name: 'CI',
      head_sha: 'abc1234567890',
      head_branch: 'main',
      html_url: 'https://github.com/...',
      created_at: '2024-01-01T00:00:00Z',
    }

    mockFetch
      .mockResolvedValueOnce({ json: () => Promise.resolve({ workflow_runs: [run] }) })
      .mockRejectedValueOnce(new Error('No Vercel token'))

    const res = await GET()
    const data = await res.json()

    expect(data.ci).not.toBeNull()
    expect(data.ci.status).toBe('completed')
    expect(data.ci.conclusion).toBe('success')
    expect(data.ci.sha).toBe('abc1234') // first 7 chars
    expect(data.ci.branch).toBe('main')
  })

  it('фильтрует gh-pages из workflow runs', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    process.env.GH_TOKEN = 'gh-test-token'

    const ghPagesRun = {
      status: 'completed',
      conclusion: 'success',
      name: 'Deploy pages',
      head_sha: 'ghpages1234567',
      head_branch: 'gh-pages',
      html_url: 'https://github.com/...',
      created_at: '2024-01-01T00:00:00Z',
    }

    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ workflow_runs: [ghPagesRun] }),
    })

    const res = await GET()
    const data = await res.json()

    expect(data.ci).toBeNull() // gh-pages filtered out
  })

  it('возвращает deploy данные при наличии VERCEL_TOKEN', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    process.env.VERCEL_TOKEN = 'vercel-test-token'

    const deployment = {
      state: 'READY',
      url: 'project.vercel.app',
      meta: { githubCommitRef: 'main', githubCommitSha: 'def456789012' },
      createdAt: 1704067200000,
    }

    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ deployments: [deployment] }),
    })

    const res = await GET()
    const data = await res.json()

    expect(data.deploy).not.toBeNull()
    expect(data.deploy.state).toBe('READY')
    expect(data.deploy.sha).toBe('def4567')
  })

  it('возвращает ci=null при пустом workflow_runs', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    process.env.GH_TOKEN = 'gh-test-token'

    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ workflow_runs: [] }),
    })

    const res = await GET()
    const data = await res.json()

    expect(data.ci).toBeNull()
  })
})
