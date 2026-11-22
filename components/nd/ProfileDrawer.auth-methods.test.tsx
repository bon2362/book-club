/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useSession } from 'next-auth/react'

let ProfileDrawer: typeof import('./ProfileDrawer').default

jest.mock('next-auth/react', () => ({
  signOut: jest.fn(),
  useSession: jest.fn(),
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

function jsonResponse(body: unknown, init?: { status?: number }) {
  return {
    ok: !init?.status || init.status < 400,
    status: init?.status ?? 200,
    json: async () => body,
  } as Response
}

function renderDrawer() {
  return render(
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
      onDeleteAccount={jest.fn()}
      onToggleBook={jest.fn()}
    />
  )
}

describe('ProfileDrawer auth methods', () => {
  beforeAll(async () => {
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME = 'slow_rising_bot'
    ProfileDrawer = (await import('./ProfileDrawer')).default
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockUseSession.mockReturnValue({
      data: {
        user: {
          id: 'user-1',
          name: 'Евгений Кошкин',
          provider: 'telegram',
          contactEmail: null,
        },
      },
    })
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/me') {
        return jsonResponse({
          user: {
            authMethods: [
              {
                provider: 'telegram',
                providerAccountId: 'tg-1',
                email: null,
                telegramUsername: 'Evgeniy_Koshkin',
                lastSeenAt: '2026-06-13T10:00:00.000Z',
              },
            ],
          },
        })
      }
      if (url === '/api/profile' || url === '/api/priorities') {
        return jsonResponse({})
      }
      if (url === '/api/submissions/me') {
        return jsonResponse({ submissions: [] })
      }
      if (url === '/api/account/identities/email') {
        return jsonResponse({ ok: true })
      }
      return jsonResponse({})
    }) as jest.Mock
  })

  it('lets a telegram-only user start email linking from the email auth method row', async () => {
    renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: 'Профиль' }))

    const emailMethod = await screen.findByTestId('auth-method-email')
    fireEvent.click(within(emailMethod).getByRole('button', { name: /привязать/i }))
    fireEvent.change(within(emailMethod).getByLabelText(/email для привязки/i), {
      target: { value: 'User@Test.com' },
    })
    fireEvent.click(within(emailMethod).getByRole('button', { name: /получить ссылку/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/account/identities/email', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'User@Test.com' }),
      }))
    })
    expect(await within(emailMethod).findByText(/проверьте почту/i)).toBeInTheDocument()
  })

  it('shows a copyable /start command after Telegram linking starts', async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/me') {
        return jsonResponse({ user: { authMethods: [] } })
      }
      if (url === '/api/account/identities/telegram/link-start') {
        return jsonResponse({ nonce: 'nonce-xyz' })
      }
      if (url === '/api/profile' || url === '/api/priorities' || url === '/api/submissions/me') {
        return jsonResponse({ submissions: [] })
      }
      return jsonResponse({})
    }) as jest.Mock
    window.open = jest.fn()

    renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: 'Профиль' }))

    const telegramMethod = await screen.findByTestId('auth-method-telegram')
    fireEvent.click(within(telegramMethod).getByRole('button', { name: /привязать/i }))

    expect(await within(telegramMethod).findByTestId('telegram-link-command')).toHaveTextContent('/start link_nonce-xyz')
    expect(within(telegramMethod).getByRole('button', { name: /скопировать команду/i })).toBeInTheDocument()
    expect(window.open).toHaveBeenCalledWith(expect.stringContaining('start=link_nonce-xyz'), '_blank')
  })
})
