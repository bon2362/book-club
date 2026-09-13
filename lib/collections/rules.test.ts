import {
  canDeleteCollection,
  canViewCollection,
  classifyCollectionEdit,
  collectionSortAt,
  isChangedSinceReview,
  normalizeBookIds,
  planAdminAction,
  planContentSave,
  planSubmit,
  validateCollectionContent,
} from './rules'
import { CollectionError } from './errors'
import type { CollectionRecord } from './types'

const now = new Date('2026-09-13T12:00:00Z')
const earlier = new Date('2026-09-10T12:00:00Z')

function record(overrides: Partial<CollectionRecord> = {}): CollectionRecord {
  return {
    id: 'c1',
    slug: null,
    authorUserId: 'author',
    status: 'draft',
    moderationReason: null,
    submittedAt: null,
    editedAt: null,
    publishedAt: null,
    reviewedAt: null,
    reviewedSnapshot: null,
    createdAt: earlier,
    updatedAt: earlier,
    title: 'Тема',
    descriptionMarkdown: 'Описание',
    displayName: 'Аня',
    bookIds: ['a', 'b'],
    ...overrides,
  }
}

describe('права', () => {
  it('черновик не видит гость, опубликованную видят все', () => {
    expect(canViewCollection(record(), { userId: null, isAdmin: false })).toBe(false)
    expect(canViewCollection(record({ status: 'published' }), { userId: null, isAdmin: false })).toBe(true)
  })

  it('автор не удаляет опубликованную, админ удаляет любую', () => {
    expect(canDeleteCollection(record({ status: 'published' }), { userId: 'author', isAdmin: false })).toBe(false)
    expect(canDeleteCollection(record({ status: 'hidden' }), { userId: 'author', isAdmin: false })).toBe(true)
    expect(canDeleteCollection(record({ status: 'published' }), { userId: 'admin', isAdmin: true })).toBe(true)
  })
})

describe('содержимое', () => {
  it('нормализует id книг, сохраняя порядок', () => {
    expect(normalizeBookIds([' a', 'b', 'a', '', 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('проверяет лимиты и повторы', () => {
    expect(validateCollectionContent({ title: 'x'.repeat(121), descriptionMarkdown: '', displayName: '', bookIds: ['a', 'a'] }, 'save'))
      .toEqual(expect.arrayContaining(['title_too_long', 'duplicate_books']))
  })

  it('перестановка — не правка содержимого', () => {
    const prev = { title: 'Т', descriptionMarkdown: 'О', displayName: 'П', bookIds: ['a', 'b'] }
    expect(classifyCollectionEdit(prev, { ...prev, bookIds: ['b', 'a'] })).toBe('order_only')
    expect(classifyCollectionEdit(prev, { ...prev, bookIds: ['a', 'b', 'c'] })).toBe('content')
  })
})

describe('отправка и сохранение', () => {
  it('для отправки нужны два опубликованных текста', () => {
    expect(() => planSubmit(record(), now, new Set(['a']))).toThrow(CollectionError)
    expect(planSubmit(record(), now, new Set(['a', 'b']))).toMatchObject({ status: 'pending', submittedAt: now })
  })

  it('перестановка автором не трогает время правки', () => {
    const saved = planContentSave(record({ status: 'published' }), { title: 'Тема', descriptionMarkdown: 'Описание', displayName: 'Аня', bookIds: ['b', 'a'] }, 'author', now)
    expect(saved.kind).toBe('order_only')
    expect(saved.patch.editedAt).toBeUndefined()
  })

  it('правка текста автором ставит время правки', () => {
    const saved = planContentSave(record({ status: 'published' }), { title: 'Новое', descriptionMarkdown: 'Описание', displayName: 'Аня', bookIds: ['a', 'b'] }, 'author', now)
    expect(saved.patch.editedAt).toEqual(now)
  })
})

describe('модерация', () => {
  it('скрытие требует причину, первая публикация назначает адрес', () => {
    expect(() => planAdminAction(record({ status: 'published' }), 'hide', { reason: ' ', now, slug: null })).toThrow('validation')
    expect(planAdminAction(record({ status: 'pending' }), 'publish', { reason: null, now, slug: 'tema' }))
      .toMatchObject({ status: 'published', slug: 'tema' })
  })

  it('«Правка проверена» снимает пометку, но сохраняет время правки автора для сортировки', () => {
    const edited = record({ status: 'published', publishedAt: earlier, reviewedAt: earlier, editedAt: new Date('2026-09-12T12:00:00Z') })
    expect(isChangedSinceReview(edited)).toBe(true)

    const patch = planAdminAction(edited, 'mark_reviewed', { reason: null, now, slug: null })
    expect(patch).toMatchObject({ status: 'published', reviewedAt: now })
    expect(patch).not.toHaveProperty('editedAt')

    const reviewed = { ...edited, ...patch }
    expect(isChangedSinceReview(reviewed)).toBe(false)
    expect(collectionSortAt(reviewed)).toEqual(edited.editedAt)
  })
})
