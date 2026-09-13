/** @jest-environment jsdom */
import { act, fireEvent, render, screen } from '@testing-library/react'
import ProfileCollectionsTab from './ProfileCollectionsTab'

jest.mock('@/lib/analytics', () => ({ track: jest.fn() }))
jest.mock('./CoverImage', () => ({ __esModule: true, default: () => <span /> }))

const item = (overrides: Record<string, unknown>) => ({
  id: 'c', slug: null, title: 'Тема', status: 'draft', moderationReason: null, textsCount: 2, covers: [],
  changedAt: '2026-09-13T09:00:00Z', submittedAt: null, ...overrides,
})
function mockList(collections: unknown[]) {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ collections }) }) as never
}

it('показывает приглашение, когда подборок нет', async () => {
  mockList([])
  await act(async () => { render(<ProfileCollectionsTab />) })
  expect(screen.getByText(/Вы ещё не собирали подборок/)).toBeInTheDocument()
})

it('показывает действия и причину для соответствующих статусов', async () => {
  mockList([item({ id: 'd', status: 'draft' }), item({ id: 'p', status: 'published', slug: 'tema' }), item({ id: 'r', status: 'rejected', moderationReason: 'Мало текста' })])
  await act(async () => { render(<ProfileCollectionsTab />) })
  expect(screen.getByRole('button', { name: 'Отправить' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Открыть' })).toHaveAttribute('href', '/collections/tema')
  expect(screen.getByRole('button', { name: 'Отправить снова' })).toBeInTheDocument()
  expect(screen.getByText(/Почему не опубликовали:/)).toBeInTheDocument()
  expect(screen.getByText(/Почему не опубликовали: Мало текста/)).toBeInTheDocument()
})

it('показывает текст ошибки отправки', async () => {
  mockList([item({ id: 'd', status: 'draft' })])
  await act(async () => { render(<ProfileCollectionsTab />) })
  ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'validation', issues: ['too_few_books'] }) })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Отправить' })) })
  expect(screen.getByText('Нужно минимум два текста из каталога')).toBeInTheDocument()
})
