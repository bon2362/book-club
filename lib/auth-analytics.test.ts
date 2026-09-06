import {
  applyLoginPersonProperties,
  trackAccountsMerged,
  trackAuthFailed,
  trackAuthSucceeded,
  trackIdentityConflict,
} from '@/lib/auth-analytics'
import { captureServerEvent, setPersonProperties } from '@/lib/posthog-server'

jest.mock('@/lib/posthog-server', () => ({
  captureServerEvent: jest.fn().mockResolvedValue(undefined),
  setPersonProperties: jest.fn().mockResolvedValue(undefined),
}))

const captureMock = captureServerEvent as jest.MockedFunction<typeof captureServerEvent>
const personMock = setPersonProperties as jest.MockedFunction<typeof setPersonProperties>

describe('auth analytics', () => {
  it('reports a successful sign-in with provider, newness and how the account was resolved', async () => {
    await trackAuthSucceeded('user-1', 'telegram', true, 'new')
    expect(captureMock).toHaveBeenCalledWith('user-1', 'auth_succeeded', {
      provider: 'telegram',
      is_new_user: true,
      linked_by: 'new',
    })
  })

  it('reports a failed sign-in with a machine-readable reason', async () => {
    await trackAuthFailed('user-1', 'google', 'identity_conflict')
    expect(captureMock).toHaveBeenCalledWith('user-1', 'auth_failed', {
      provider: 'google',
      reason: 'identity_conflict',
    })
  })

  it('never fabricates a distinct id when the user is unknown', async () => {
    await trackAuthFailed(null, 'email', 'user_not_found')
    await trackAuthFailed(undefined, 'email', 'user_not_found')
    expect(captureMock).not.toHaveBeenCalled()
  })

  it('reports an identity conflict with both accounts involved', async () => {
    await trackIdentityConflict('google', 'user-new', 'user-existing')
    expect(captureMock).toHaveBeenCalledWith('user-new', 'identity_conflict', {
      provider: 'google',
      user_id: 'user-new',
      existing_user_id: 'user-existing',
    })
  })

  it('reports an admin account merge', async () => {
    await trackAccountsMerged('target', 'source', 7, 'admin-1')
    expect(captureMock).toHaveBeenCalledWith('target', 'accounts_merged', {
      source_user_id: 'source',
      target_user_id: 'target',
      moved_count: 7,
      actor_user_id: 'admin-1',
    })
  })

  it('sends approved person properties on login', async () => {
    await applyLoginPersonProperties('user-1', {
      name: 'Иван',
      telegramUsername: 'ivan',
      providers: ['telegram', 'google'],
      createdAt: new Date('2026-01-02T03:04:05.000Z'),
      isAdmin: false,
    })
    expect(personMock).toHaveBeenCalledWith('user-1', {
      name: 'Иван',
      telegram_username: 'ivan',
      providers: ['telegram', 'google'],
      created_at: '2026-01-02T03:04:05.000Z',
      is_admin: false,
    })
  })

  // Privacy regression guard: the project owner decided email must never reach
  // PostHog, and content/privacy.md promises exactly that.
  it('never leaks an email into person properties', async () => {
    await applyLoginPersonProperties('user-1', {
      name: 'ivan@example.com',
      telegramUsername: null,
      providers: ['email'],
      createdAt: null,
      isAdmin: false,
    })
    const [, properties] = personMock.mock.calls[0]
    expect(Object.keys(properties)).not.toContain('email')
    expect(Object.keys(properties).sort()).toEqual(
      ['created_at', 'is_admin', 'name', 'providers', 'telegram_username'],
    )
  })

  it('never breaks sign-in when analytics delivery throws', async () => {
    captureMock.mockRejectedValueOnce(new Error('posthog down'))
    personMock.mockRejectedValueOnce(new Error('posthog down'))
    await expect(trackAuthSucceeded('user-1', 'email', false, 'identity')).resolves.toBeUndefined()
    await expect(
      applyLoginPersonProperties('user-1', {
        name: null, telegramUsername: null, providers: [], createdAt: null, isAdmin: false,
      }),
    ).resolves.toBeUndefined()
  })
})
