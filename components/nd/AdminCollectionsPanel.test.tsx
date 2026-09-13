/** @jest-environment jsdom */
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import AdminCollectionsPanel from './AdminCollectionsPanel'

jest.mock('./AdminCollectionReview', () => ({ __esModule: true, default: ({ id }: { id: string }) => <div data-testid="review">{id}</div> }))
jest.mock('./CoverImage', () => ({ __esModule: true, default: () => <span /> }))

const item = (id: string, overrides = {}) => ({ id, slug: null, title: `Подборка ${id}`, displayName: 'Аня', status: 'pending', textsCount: 3, covers: [], at: '2026-09-11T11:02:00Z', diffSummary: null, ...overrides })
const queue = { pending: [item('p1')], changed: [item('c1', { status: 'published', diffSummary: { added: 1, removed: 1, textChanged: true, orderChanged: false } })], published: [item('ok', { status: 'published' })], rejectedOrHidden: [] }
function mockApi(homeBlockEnabled = false) { global.fetch = jest.fn(async (url: string, init?: RequestInit) => { if (url === '/api/admin/collections') return { ok: true, json: async () => ({ queue }) }; if (url === '/api/admin/collections/settings' && init?.method === 'PATCH') return { ok: true, json: async () => JSON.parse(String(init.body)) }; return { ok: true, json: async () => ({ homeBlockEnabled }) } }) as never }

it('показывает секции со счётчиками и сводку изменений', async () => { mockApi(); const onCountChange = jest.fn(); await act(async () => { render(<AdminCollectionsPanel onCountChange={onCountChange} />) }); expect(within(screen.getByTestId('queue-pending')).getByText('Подборка p1')).toBeInTheDocument(); expect(within(screen.getByTestId('queue-changed')).getByText(/\+1 · −1 · текст/)).toBeInTheDocument(); expect(screen.getByTestId('queue-rejected-hidden')).toHaveTextContent('Пусто'); expect(onCountChange).toHaveBeenCalledWith(2) })
it('первым выбирает верх очереди и меняет выбор по клику', async () => { mockApi(); await act(async () => { render(<AdminCollectionsPanel />) }); expect(screen.getByTestId('review')).toHaveTextContent('p1'); fireEvent.click(screen.getByText('Подборка ok')); expect(screen.getByTestId('review')).toHaveTextContent('ok') })
it('выбирает подборку из адреса', async () => { mockApi(); await act(async () => { render(<AdminCollectionsPanel initialSelectedId="ok" />) }); expect(screen.getByTestId('review')).toHaveTextContent('ok') })
it('переключает блок на главной', async () => { mockApi(false); await act(async () => { render(<AdminCollectionsPanel />) }); const toggle = screen.getByRole('button', { name: /Блок подборок на главной/ }); expect(toggle).toHaveAttribute('aria-pressed', 'false'); await act(async () => { fireEvent.click(toggle) }); expect(global.fetch).toHaveBeenCalledWith('/api/admin/collections/settings', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ homeBlockEnabled: true }) })); expect(toggle).toHaveAttribute('aria-pressed', 'true') })
