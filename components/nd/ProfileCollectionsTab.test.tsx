/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import ProfileCollectionsTab from './ProfileCollectionsTab'
import { track } from '@/lib/analytics'

jest.mock('@/lib/analytics', () => ({ track: jest.fn() }))
jest.mock('./CoverImage', () => ({ __esModule: true, default: () => <span /> }))

function item(overrides: Record<string, unknown>) {
  return {
    id: 'c',
    slug: null,
    title: 'Тема',
    status: 'draft',
    moderationReason: null,
    textsCount: 2,
    covers: [],
    changedAt: '2026-09-13T09:00:00Z',
    submittedAt: null,
    ...overrides,
  }
}

function mockList(collections: unknown[]) {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ collections }) }) as never
}

it('пусто — приглашение собрать', async () => {
  mockList([])
  await act(async () => { render(<ProfileCollectionsTab />) })
  expect(screen.getByText(/Вы ещё не собирали подборок/)).toBeInTheDocument()
})

it('кнопки по статусам и причины отказа и скрытия', async () => {
  mockList([
    item({ id: 'd', status: 'draft' }),
    item({ id: 'p', status: 'published', slug: 'tema' }),
    item({ id: 'r', status: 'rejected', moderationReason: 'Мало текста' }),
    item({ id: 'h', status: 'hidden', moderationReason: 'Нет описания' }),
  ])
  await act(async () => { render(<ProfileCollectionsTab />) })

  expect(screen.getByRole('button', { name: 'Отправить' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Открыть' })).toHaveAttribute('href', '/collections/tema')
  expect(screen.getAllByRole('button', { name: 'Отправить снова' })).toHaveLength(2)
  expect(screen.getByText('Почему не опубликовали:')).toBeInTheDocument()
  expect(screen.getByText('Мало текста')).toBeInTheDocument()
  expect(screen.getByText('Почему скрыли:')).toBeInTheDocument()
})

it('ошибка отправки показывает текст проблемы, успех — событие', async () => {
  mockList([item({ id: 'd', status: 'draft' })])
  await act(async () => { render(<ProfileCollectionsTab />) })

  ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'validation', issues: ['too_few_books'] }) })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Отправить' })) })
  expect(screen.getByText('Нужно минимум два текста из каталога')).toBeInTheDocument()

  ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ collection: {} }) })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Отправить' })) })
  expect(track).toHaveBeenCalledWith('collection_submitted', { collection_id: 'd', source: 'profile' })
})
