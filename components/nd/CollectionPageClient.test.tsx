/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import CollectionPageClient from './CollectionPageClient'
import { track } from '@/lib/analytics'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }) }))
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }))
jest.mock('./Header', () => ({ __esModule: true, default: () => <header /> }))
jest.mock('./SummaryMarkdown', () => ({ __esModule: true, default: ({ markdown }: { markdown: string }) => <div>{markdown}</div> }))
jest.mock('./AuthorAvatar', () => ({ __esModule: true, default: () => <span /> }))
jest.mock('./AuthModal', () => ({
  __esModule: true,
  default: ({ isOpen, title }: { isOpen: boolean; title?: string }) => (isOpen ? <div role="dialog">{title}</div> : null),
}))
jest.mock('./ContactsForm', () => ({ __esModule: true, default: () => <div role="dialog">Контакты</div> }))

// Имена с префиксом mock: только их Jest разрешает использовать внутри фабрики jest.mock.
const mockCardProps: Array<Record<string, unknown>> = []
function mockCard(props: { book: { id: string; name: string }; isSelected: boolean; onToggle: (book: unknown) => void }) {
  mockCardProps.push(props)
  return (
    <article>
      <button onClick={() => props.onToggle(props.book)}>
        {props.isSelected ? '✓ В вашем списке' : `Хочу читать ${props.book.name}`}
      </button>
    </article>
  )
}
jest.mock('./BookCard', () => ({ __esModule: true, default: (props: never) => mockCard(props) }))
jest.mock('./BookCardMobile', () => ({ __esModule: true, default: () => null }))

const collection = {
  id: 'c1',
  slug: 'tema',
  authorUserId: 'author',
  displayName: 'Аня',
  title: 'Тема',
  descriptionMarkdown: 'Описание',
  status: 'published' as const,
  moderationReason: null,
  bookIds: ['b1', 'b2'],
  submittedAt: null,
  editedAt: null,
  publishedAt: '2026-09-10T10:00:00Z',
  reviewedAt: null,
  reviewedSnapshot: null,
  createdAt: '2026-09-01T10:00:00Z',
  updatedAt: '2026-09-10T10:00:00Z',
}
const book = (id: string) => ({ book: { id, name: `Книга ${id}`, status: 'read' } as never, hiddenFromCatalog: false })
const books = [book('b1'), book('b2')]
const guest = { isLoggedIn: false, isAdmin: false, canEdit: false }
const member = { isLoggedIn: true, isAdmin: false, canEdit: false }
const signupState = (overrides = {}) => ({ name: 'Н', contacts: '@n', selectedBookIds: [], personalStatuses: {}, ...overrides })

beforeEach(() => {
  mockCardProps.length = 0
  localStorage.clear()
  ;(track as jest.Mock).mockClear()
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) }) as never
})

it('рисует карточки без статуса клуба, с номерами и счётчиком', () => {
  render(<CollectionPageClient collection={collection} books={books} viewer={guest} signupState={null} />)
  expect(mockCardProps.every((props) => props.ignoreClubStatus === true)).toBe(true)
  expect(screen.getAllByText('№ 01').length).toBeGreaterThan(0)
  expect(screen.getByText('2 текста')).toBeInTheDocument()
})

it('показывает автора, дату изменения и отправляет событие просмотра', () => {
  render(<CollectionPageClient collection={collection} books={books} viewer={guest} signupState={null} />)
  expect(screen.getByText('Собрал:а', { exact: false })).toHaveTextContent('Собрал:а Аня')
  expect(screen.getByText(/изменена .* · 10 сентября/)).toBeInTheDocument()
  expect(track).toHaveBeenCalledWith('collection_viewed', { collection_id: 'c1', viewer: 'guest' })
})

it('копирует ссылку на подборку', async () => {
  const writeText = jest.fn().mockResolvedValue(undefined)
  Object.assign(navigator, { clipboard: { writeText } })
  render(<CollectionPageClient collection={collection} books={books} viewer={guest} signupState={null} />)

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Скопировать ссылку' })) })

  expect(writeText).toHaveBeenCalledWith('http://localhost/collections/tema')
  expect(screen.getByRole('button', { name: 'Ссылка скопирована' })).toBeInTheDocument()
  expect(track).toHaveBeenCalledWith('collection_link_copied', { collection_id: 'c1' })
})

it('гость: окно входа с пояснением и сохранённое намерение', () => {
  render(<CollectionPageClient collection={collection} books={books} viewer={guest} signupState={null} />)
  fireEvent.click(screen.getByText('Хочу читать Книга b1'))
  expect(screen.getByRole('dialog')).toHaveTextContent('Чтобы записаться на книгу, войдите')
  expect(JSON.parse(localStorage.getItem('collectionSignupIntent')!)).toMatchObject({ collectionRef: 'tema', bookId: 'b1' })
})

it('участник записывается одной книгой', async () => {
  render(<CollectionPageClient collection={collection} books={books} viewer={member} signupState={signupState()} />)
  await act(async () => { fireEvent.click(screen.getByText('Хочу читать Книга b2')) })
  expect(global.fetch).toHaveBeenCalledWith('/api/signup-books/b2', { method: 'POST' })
  await waitFor(() => expect(screen.getByText('✓ В вашем списке')).toBeInTheDocument())
})

it('ошибка записи видна пользователю', async () => {
  (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
  render(<CollectionPageClient collection={collection} books={books} viewer={member} signupState={signupState()} />)
  await act(async () => { fireEvent.click(screen.getByText('Хочу читать Книга b1')) })
  expect(screen.getByText('Не удалось записаться на книгу. Попробуйте ещё раз.')).toBeInTheDocument()
})

it('нет контактов — форма контактов', async () => {
  (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: 'contacts_required' }) })
  render(<CollectionPageClient collection={collection} books={books} viewer={member} signupState={signupState({ name: '', contacts: '' })} />)
  await act(async () => { fireEvent.click(screen.getByText('Хочу читать Книга b1')) })
  expect(screen.getByRole('dialog')).toHaveTextContent('Контакты')
})

it('после входа выполняет сохранённое намерение', async () => {
  localStorage.setItem('collectionSignupIntent', JSON.stringify({ collectionRef: 'tema', bookId: 'b1', savedAt: Date.now() }))
  await act(async () => {
    render(<CollectionPageClient collection={collection} books={books} viewer={member} signupState={signupState()} />)
  })
  expect(global.fetch).toHaveBeenCalledWith('/api/signup-books/b1', { method: 'POST' })
})

it('плашка статуса и причина для автора неопубликованной', () => {
  render(
    <CollectionPageClient
      collection={{ ...collection, status: 'hidden', moderationReason: 'Причина' }}
      books={books}
      viewer={{ isLoggedIn: true, isAdmin: false, canEdit: true }}
      signupState={null}
    />,
  )
  const banner = screen.getByTestId('collection-status-banner')
  expect(banner).toHaveTextContent('Скрыта')
  expect(banner).toHaveTextContent('Причина')
})
