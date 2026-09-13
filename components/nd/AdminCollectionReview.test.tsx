/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import AdminCollectionReview from './AdminCollectionReview'

jest.mock('./CoverImage', () => ({ __esModule: true, default: () => <span /> }))
jest.mock('./AuthorAvatar', () => ({ __esModule: true, default: () => <span /> }))
jest.mock('./SummaryMarkdown', () => ({ __esModule: true, default: ({ markdown }: { markdown: string }) => <div>{markdown}</div> }))
jest.mock('./CollectionEditor', () => ({ __esModule: true, default: () => <div data-testid="admin-editor" /> }))

const book = (id: string) => ({ id, title: `Книга ${id}`, author: 'Автор', coverUrl: null, year: '', isArticle: false, clubStatus: null, hiddenFromCatalog: false })

function collection(overrides = {}) {
  return {
    id: 'c1',
    slug: 'tema',
    authorUserId: 'u',
    displayName: 'Аня',
    title: 'Тема',
    descriptionMarkdown: 'Новый текст',
    status: 'pending',
    moderationReason: null,
    bookIds: ['a', 'b'],
    submittedAt: '2026-09-11T11:02:00Z',
    editedAt: null,
    publishedAt: null,
    reviewedAt: null,
    reviewedSnapshot: null,
    createdAt: '2026-09-10T00:00:00Z',
    updatedAt: '2026-09-11T11:02:00Z',
    ...overrides,
  }
}

function mockDetail(detail: unknown) {
  global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST' || init?.method === 'DELETE') {
      return { ok: true, json: async () => ({ collection: collection() }) }
    }
    return { ok: true, json: async () => detail }
  }) as never
}

it('новая: описание, состав, «Опубликовать» и ссылка «Открыть как читатель»', async () => {
  mockDetail({ collection: collection(), books: [book('a'), book('b')], diff: null })
  const onChanged = jest.fn()
  await act(async () => { render(<AdminCollectionReview id="c1" onChanged={onChanged} />) })

  expect(screen.getByText('НОВАЯ — ЖДЁТ ПРОВЕРКИ')).toBeInTheDocument()
  expect(screen.getByText('Книга b')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Открыть как читатель' })).toHaveAttribute('href', '/collections/tema')

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Опубликовать' })) })
  expect(global.fetch).toHaveBeenCalledWith('/api/admin/collections/c1/actions', expect.objectContaining({ body: JSON.stringify({ action: 'publish' }) }))
  expect(onChanged).toHaveBeenCalled()
})

it('отклонение требует причину', async () => {
  mockDetail({ collection: collection(), books: [book('a'), book('b')], diff: null })
  await act(async () => { render(<AdminCollectionReview id="c1" onChanged={jest.fn()} />) })

  fireEvent.click(screen.getByRole('button', { name: 'Отклонить с причиной' }))
  const send = screen.getByRole('button', { name: 'Отправить и отклонить' })
  expect(send).toBeDisabled()
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Добавьте описание' } })
  await act(async () => { fireEvent.click(send) })

  expect(global.fetch).toHaveBeenCalledWith('/api/admin/collections/c1/actions', expect.objectContaining({
    body: JSON.stringify({ action: 'reject', reason: 'Добавьте описание' }),
  }))
})

it('изменённая: разница состава, старый и новый текст, «Правка проверена»', async () => {
  mockDetail({
    collection: collection({ status: 'published', editedAt: '2026-09-12T00:00:00Z', reviewedAt: '2026-09-01T00:00:00Z' }),
    books: [book('a'), book('b'), book('c')],
    diff: {
      added: ['c'],
      removed: ['b'],
      moved: [{ bookId: 'a', from: 2, to: 1 }],
      title: { before: 'Старое название', after: 'Тема' },
      description: { before: 'Старый', after: 'Новый текст' },
      displayName: null,
    },
  })
  await act(async () => { render(<AdminCollectionReview id="c1" onChanged={jest.fn()} />) })

  expect(screen.getByText('ИЗМЕНЕНА ПОСЛЕ ПРОВЕРКИ')).toBeInTheDocument()
  expect(screen.getByTestId('diff-added')).toHaveTextContent('Книга c')
  expect(screen.getByTestId('diff-removed')).toHaveTextContent('Книга b')
  expect(screen.getByTestId('diff-moved')).toHaveTextContent('2 → 1')
  expect(screen.getByText('Старый').tagName).toBe('DEL')
  expect(screen.getByText('Новый текст').tagName).toBe('INS')
  expect(screen.getByText('Старое название').tagName).toBe('DEL')
  expect(screen.getByText('Правка уже видна читателям.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Правка проверена' })).toBeInTheDocument()
})

it('скрытая: причина, «Вернуть в публикацию» и удаление', async () => {
  mockDetail({ collection: collection({ status: 'hidden', moderationReason: 'Нет описания' }), books: [book('a')], diff: null })
  window.confirm = jest.fn(() => true)
  await act(async () => { render(<AdminCollectionReview id="c1" onChanged={jest.fn()} />) })

  expect(screen.getByText('Нет описания')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Вернуть в публикацию' })).toBeInTheDocument()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Удалить' })) })
  expect(global.fetch).toHaveBeenCalledWith('/api/admin/collections/c1', { method: 'DELETE' })
})

it('«Править» открывает редактор в режиме владельца', async () => {
  mockDetail({ collection: collection(), books: [book('a'), book('b')], diff: null })
  await act(async () => { render(<AdminCollectionReview id="c1" onChanged={jest.fn()} />) })
  fireEvent.click(screen.getAllByRole('button', { name: 'Править' })[0])
  expect(screen.getByTestId('admin-editor')).toBeInTheDocument()
})
