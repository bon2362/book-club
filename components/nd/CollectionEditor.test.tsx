/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import CollectionEditor from './CollectionEditor'
import { track } from '@/lib/analytics'

jest.mock('@/lib/analytics', () => ({ track: jest.fn() }))
jest.mock('./CoverImage', () => ({ __esModule: true, default: () => <span /> }))
jest.mock('./MarkdownToolbar', () => ({ __esModule: true, default: () => <div /> }))
jest.mock('./CollectionBookSearch', () => ({ __esModule: true, default: () => <input placeholder="search" /> }))

const book = (id: string, extra = {}) => ({
  id, title: `Книга ${id}`, author: 'Автор', coverUrl: null, year: '2020', isArticle: false, clubStatus: null, hiddenFromCatalog: false, ...extra,
})

const base = {
  id: 'c1',
  slug: null,
  authorUserId: 'u',
  displayName: 'Аня',
  title: 'Тема',
  descriptionMarkdown: 'Описание',
  status: 'draft' as const,
  moderationReason: null,
  bookIds: ['a', 'b'],
  submittedAt: null,
  editedAt: null,
  publishedAt: null,
  reviewedAt: null,
  reviewedSnapshot: null,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
}

beforeEach(() => {
  ;(track as jest.Mock).mockClear()
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ collection: base }) }) as never
})

it('стрелки меняют порядок, крайние неактивны', () => {
  render(<CollectionEditor mode="author" initial={base} initialBooks={[book('a'), book('b')]} />)
  const up = screen.getAllByRole('button', { name: 'Выше' })
  expect(up[0]).toBeDisabled()
  fireEvent.click(up[1])
  expect(screen.getAllByTestId('collection-book-row')[0]).toHaveTextContent('Книга b')
})

it('приписки клуба и скрытой книги видны автору', () => {
  render(<CollectionEditor mode="author" initial={base} initialBooks={[book('a', { clubStatus: 'read' }), book('b', { hiddenFromCatalog: true })]} />)
  expect(screen.getByText(/клуб уже читал/)).toBeInTheDocument()
  expect(screen.getByText(/скрыта из каталога/)).toBeInTheDocument()
})

it('счётчик символов названия и подсказки полей', () => {
  render(<CollectionEditor mode="author" initial={base} initialBooks={[book('a'), book('b')]} />)
  expect(screen.getByText('4 / 120')).toBeInTheDocument()
  expect(screen.getByText('Как вас подписать на странице подборки')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Посмотреть' })).toHaveAttribute('href', '/collections/c1')
})

it('черновик: «Отправить на проверку» и удаление доступны', () => {
  render(<CollectionEditor mode="author" initial={base} initialBooks={[book('a'), book('b')]} />)
  expect(screen.getByRole('button', { name: 'Отправить на проверку' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Удалить подборку' })).toBeInTheDocument()
})

it('отправка недоступна без подписи', () => {
  render(<CollectionEditor mode="author" initial={{ ...base, displayName: '' }} initialBooks={[book('a'), book('b')]} />)
  expect(screen.getByRole('button', { name: 'Отправить на проверку' })).toBeDisabled()
})

it('ошибка отправки показывает текст проблемы', async () => {
  render(<CollectionEditor mode="author" initial={base} initialBooks={[book('a'), book('b')]} />)
  ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: 'validation', issues: ['too_few_books'] }) })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Отправить на проверку' })) })
  expect(screen.getByTestId('collection-editor-issues')).toHaveTextContent('Нужно минимум два текста из каталога')
})

it('опубликованная: без удаления, правки уходят кнопкой и отменяются', async () => {
  render(<CollectionEditor mode="author" initial={{ ...base, status: 'published', slug: 'tema' }} initialBooks={[book('a'), book('b')]} />)
  expect(screen.queryByRole('button', { name: 'Удалить подборку' })).toBeNull()

  const publish = screen.getByRole('button', { name: 'Опубликовать правки' })
  const cancel = screen.getByRole('button', { name: 'Отменить правки' })
  expect(publish).toBeDisabled()

  fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Новая тема' } })
  expect(publish).toBeEnabled()
  fireEvent.click(cancel)
  expect(screen.getByLabelText('Название')).toHaveValue('Тема')
  expect(publish).toBeDisabled()

  fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Новая тема' } })
  await act(async () => { fireEvent.click(publish) })
  expect(global.fetch).toHaveBeenCalledWith('/api/me/collections/c1', expect.objectContaining({ method: 'PATCH' }))
  expect(track).toHaveBeenCalledWith('collection_edits_published', { collection_id: 'c1' })
})

it('владелец сайта сохраняет через админский роут', async () => {
  const onSaved = jest.fn()
  render(<CollectionEditor mode="admin" initial={{ ...base, status: 'pending' }} initialBooks={[book('a'), book('b')]} onSaved={onSaved} />)
  fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Правка' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Сохранить' })) })
  expect(global.fetch).toHaveBeenCalledWith('/api/admin/collections/c1', expect.objectContaining({ method: 'PATCH' }))
  expect(onSaved).toHaveBeenCalled()
})
