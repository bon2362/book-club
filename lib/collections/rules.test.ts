import { canDeleteCollection, canViewCollection, normalizeBookIds, planAdminAction, planContentSave, planSubmit, validateCollectionContent } from './rules'
import { CollectionError } from './errors'
import type { CollectionRecord } from './types'

const now = new Date('2026-09-13T12:00:00Z')
const earlier = new Date('2026-09-10T12:00:00Z')
const record = (overrides: Partial<CollectionRecord> = {}): CollectionRecord => ({
  id: 'c1', slug: null, authorUserId: 'author', status: 'draft', moderationReason: null,
  submittedAt: null, editedAt: null, publishedAt: null, reviewedAt: null, reviewedSnapshot: null,
  createdAt: earlier, updatedAt: earlier, title: 'Тема', descriptionMarkdown: 'Описание', displayName: 'Аня', bookIds: ['a', 'b'], ...overrides,
})

describe('правила подборок', () => {
  it('не показывает черновик гостю и не даёт автору удалить опубликованную', () => {
    expect(canViewCollection(record(), { userId: null, isAdmin: false })).toBe(false)
    expect(canDeleteCollection(record({ status: 'published' }), { userId: 'author', isAdmin: false })).toBe(false)
  })
  it('нормализует id книг, сохраняя их порядок', () => {
    expect(normalizeBookIds([' a', 'b', 'a', '', 'c'])).toEqual(['a', 'b', 'c'])
  })
  it('требует два опубликованных текста для отправки', () => {
    expect(() => planSubmit(record(), now, new Set(['a']))).toThrow(CollectionError)
    expect(planSubmit(record(), now, new Set(['a', 'b']))).toMatchObject({ status: 'pending', submittedAt: now })
  })
  it('не помечает перестановку как правку для модерации', () => {
    const saved = planContentSave(record({ status: 'published' }), { title: 'Тема', descriptionMarkdown: 'Описание', displayName: 'Аня', bookIds: ['b', 'a'] }, 'author', now)
    expect(saved.kind).toBe('order_only')
    expect(saved.patch.editedAt).toBeUndefined()
  })
  it('требует причину при скрытии и назначает slug первой публикации', () => {
    expect(() => planAdminAction(record({ status: 'published' }), 'hide', { reason: ' ', now, slug: null })).toThrow('validation')
    expect(planAdminAction(record({ status: 'pending' }), 'publish', { reason: null, now, slug: 'tema' })).toMatchObject({ status: 'published', slug: 'tema' })
  })
  it('валидирует лимиты и дублирующие книги', () => {
    expect(validateCollectionContent({ title: 'x'.repeat(121), descriptionMarkdown: '', displayName: '', bookIds: ['a', 'a'] }, 'save')).toEqual(expect.arrayContaining(['title_too_long', 'duplicate_books']))
  })
})
