/** @jest-environment jsdom */
import { act, fireEvent, render, screen } from '@testing-library/react'
import CollectionEditor from './CollectionEditor'

jest.mock('@/lib/analytics', () => ({ track: jest.fn() }))
jest.mock('./CoverImage', () => ({ __esModule: true, default: () => <span /> }))
jest.mock('./MarkdownToolbar', () => ({ __esModule: true, default: () => <div /> }))
jest.mock('./CollectionBookSearch', () => ({ __esModule: true, default: () => <input placeholder="search" /> }))

const book = (id: string, extra = {}) => ({ id, title: `Книга ${id}`, author: 'Автор', coverUrl: null, year: '2020', isArticle: false, clubStatus: null, hiddenFromCatalog: false, ...extra })
const base = { id: 'c1', slug: null, authorUserId: 'u', displayName: 'Аня', title: 'Тема', descriptionMarkdown: 'Описание', status: 'draft' as const, moderationReason: null, bookIds: ['a', 'b'], submittedAt: null, editedAt: null, publishedAt: null, reviewedAt: null, reviewedSnapshot: null, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' }

beforeEach(() => { global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ collection: base }) }) as never })

it('меняет порядок книг и отключает крайнюю стрелку', () => {
  render(<CollectionEditor mode="author" initial={base} initialBooks={[book('a'), book('b')]} />)
  const up = screen.getAllByRole('button', { name: 'Выше' })
  expect(up[0]).toBeDisabled()
  fireEvent.click(up[1])
  expect(screen.getAllByTestId('collection-book-row')[0]).toHaveTextContent('Книга b')
})

it('показывает в редакторе отметки статуса клуба и скрытой книги', () => {
  render(<CollectionEditor mode="author" initial={base} initialBooks={[book('a', { clubStatus: 'read' }), book('b', { hiddenFromCatalog: true })]} />)
  expect(screen.getByText(/клуб уже читал/)).toBeInTheDocument()
  expect(screen.getByText(/скрыта из каталога/)).toBeInTheDocument()
})

it('даёт отправить черновик и удалить его', () => {
  render(<CollectionEditor mode="author" initial={base} initialBooks={[book('a'), book('b')]} />)
  expect(screen.getByRole('button', { name: 'Отправить на проверку' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Удалить подборку' })).toBeInTheDocument()
})

it('не даёт отправить без подписи', () => {
  render(<CollectionEditor mode="author" initial={{ ...base, displayName: '' }} initialBooks={[book('a'), book('b')]} />)
  expect(screen.getByRole('button', { name: 'Отправить на проверку' })).toBeDisabled()
})

it('публикует изменения опубликованной подборки только после правки', async () => {
  render(<CollectionEditor mode="author" initial={{ ...base, status: 'published', slug: 'tema' }} initialBooks={[book('a'), book('b')]} />)
  expect(screen.queryByRole('button', { name: 'Удалить подборку' })).toBeNull()
  const publish = screen.getByRole('button', { name: 'Опубликовать правки' })
  expect(publish).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Новая тема' } })
  expect(publish).toBeEnabled()
  await act(async () => { fireEvent.click(publish) })
  expect(global.fetch).toHaveBeenCalledWith('/api/me/collections/c1', expect.objectContaining({ method: 'PATCH' }))
})

it('сохраняет правку администратора через его маршрут', async () => {
  const onSaved = jest.fn()
  render(<CollectionEditor mode="admin" initial={{ ...base, status: 'pending' }} initialBooks={[book('a'), book('b')]} onSaved={onSaved} />)
  fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Правка' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Сохранить' })) })
  expect(global.fetch).toHaveBeenCalledWith('/api/admin/collections/c1', expect.objectContaining({ method: 'PATCH' }))
  expect(onSaved).toHaveBeenCalled()
})
