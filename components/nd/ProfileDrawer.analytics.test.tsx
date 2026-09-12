/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import ProfileDrawer from './ProfileDrawer'
import { track } from '@/lib/analytics'

jest.mock('next-auth/react', () => ({
  signOut: jest.fn(),
  useSession: jest.fn(),
}))

jest.mock('@/lib/analytics', () => ({
  track: jest.fn(),
}))

jest.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PointerSensor: jest.fn(),
  TouchSensor: jest.fn(),
  closestCenter: jest.fn(),
  useSensor: jest.fn(),
  useSensors: jest.fn(() => []),
}))

jest.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  verticalListSortingStrategy: {},
  arrayMove: jest.fn((items: unknown[]) => items),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: jest.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}))

jest.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: jest.fn(() => '') } },
}))

const mockUseSession = useSession as jest.Mock
const mockTrack = track as jest.Mock

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response
}

function renderDrawer(onDeleteAccount = jest.fn()) {
  render(
    <ProfileDrawer
      isOpen={true}
      onClose={jest.fn()}
      selectedBooks={[]}
      initialSignups={[]}
      books={[]}
      currentUser={{
        timestamp: '2026-01-01T00:00:00Z',
        userId: 'user-1',
        name: 'Евгений Кошкин',
        email: null,
        contacts: '@Evgeniy_Koshkin',
        selectedBooks: [],
        selectedBookIds: [],
        signups: [],
      }}
      savedUser={{ name: 'Евгений Кошкин', contacts: '@Evgeniy_Koshkin' }}
      onSaveContacts={jest.fn()}
      onDeleteAccount={onDeleteAccount}
      onToggleBook={jest.fn()}
    />
  )
  return { onDeleteAccount }
}

const eventsNamed = (name: string) => mockTrack.mock.calls.filter(([event]) => event === name)

describe('ProfileDrawer analytics', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-1', name: 'Евгений Кошкин', provider: 'telegram', contactEmail: null } },
    })
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/me') {
        return jsonResponse({
          user: {
            authMethods: [{
              provider: 'telegram',
              providerAccountId: 'tg-1',
              email: null,
              telegramUsername: 'Evgeniy_Koshkin',
              lastSeenAt: '2026-06-13T10:00:00.000Z',
            }],
          },
        })
      }
      if (url === '/api/profile') return jsonResponse({ languages: [] })
      if (url === '/api/submissions/me') return jsonResponse({ submissions: [] })
      return jsonResponse({ ok: true })
    }) as jest.Mock
  })

  it('переход на вкладку шлёт profile_tab_opened, повторный клик по текущей — нет', () => {
    renderDrawer()

    fireEvent.click(screen.getByRole('button', { name: 'Профиль' }))
    expect(mockTrack).toHaveBeenCalledWith('profile_tab_opened', { tab: 'profile' })

    fireEvent.click(screen.getByRole('button', { name: 'Профиль' }))
    expect(eventsNamed('profile_tab_opened')).toHaveLength(1)
  })

  it('отметка языка шлёт profile_language_toggled', async () => {
    renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: 'Профиль' }))

    const chip = await screen.findByRole('button', { name: /на русском/i })
    await waitFor(() => expect(chip).not.toBeDisabled())
    fireEvent.click(chip)

    expect(mockTrack).toHaveBeenCalledWith('profile_language_toggled', expect.objectContaining({
      language: 'ru',
      enabled: true,
      count: 1,
    }))
  })

  it('привязка почты шлёт начало и отправку письма', async () => {
    renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: 'Профиль' }))

    const emailMethod = await screen.findByTestId('auth-method-email')
    fireEvent.click(within(emailMethod).getByRole('button', { name: /привязать/i }))
    fireEvent.change(within(emailMethod).getByLabelText(/email для привязки/i), {
      target: { value: 'user@test.com' },
    })
    fireEvent.click(within(emailMethod).getByRole('button', { name: /получить ссылку/i }))

    await waitFor(() => {
      expect(mockTrack).toHaveBeenCalledWith('profile_identity_link_email_sent')
    })
    expect(mockTrack).toHaveBeenCalledWith('profile_identity_link_started', { provider: 'email' })
  })

  it('отказ от удаления аккаунта шлёт account_deletion_cancelled и ничего не удаляет', () => {
    window.confirm = jest.fn(() => false)
    const { onDeleteAccount } = renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: 'Профиль' }))

    fireEvent.click(screen.getByRole('button', { name: /удалить аккаунт/i }))

    expect(mockTrack).toHaveBeenCalledWith('account_deletion_cancelled')
    expect(onDeleteAccount).not.toHaveBeenCalled()
  })
})
