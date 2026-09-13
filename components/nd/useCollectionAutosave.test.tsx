/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { useCollectionAutosave } from './useCollectionAutosave'

const content = (title: string) => ({ title, descriptionMarkdown: '', displayName: '', bookIds: [] })
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body })

beforeEach(() => { jest.useFakeTimers(); global.fetch = jest.fn() as never })
afterEach(() => jest.useRealTimers())

it('не создаёт черновик без названия', async () => {
  renderHook(() => useCollectionAutosave({ initialId: null, content: content(''), enabled: true }))
  await act(async () => { jest.advanceTimersByTime(1000) })
  expect(global.fetch).not.toHaveBeenCalled()
})

it('создаёт черновик и затем сохраняет содержимое', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValueOnce(ok({ collection: { id: 'c1' } })).mockResolvedValueOnce(ok({ collection: { id: 'c1' } }))
  const onCreated = jest.fn()
  const { result, rerender } = renderHook(({ value }) => useCollectionAutosave({ initialId: null, content: value, enabled: true, onCreated }), { initialProps: { value: content('') } })
  rerender({ value: content('Тема') })
  await act(async () => { jest.advanceTimersByTime(900) })
  expect(global.fetch).toHaveBeenNthCalledWith(1, '/api/me/collections', expect.objectContaining({ method: 'POST' }))
  expect(global.fetch).toHaveBeenNthCalledWith(2, '/api/me/collections/c1', expect.objectContaining({ method: 'PATCH' }))
  expect(onCreated).toHaveBeenCalledWith('c1')
  expect(result.current.state).toBe('saved')
})

it('передаёт ошибку валидации в issues', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: 'validation', issues: ['title_too_long'] }) })
  const { result, rerender } = renderHook(({ value }) => useCollectionAutosave({ initialId: 'c1', content: value, enabled: true }), { initialProps: { value: content('') } })
  rerender({ value: content('x') })
  await act(async () => { jest.advanceTimersByTime(900) })
  expect(result.current.issues).toEqual(['title_too_long'])
})

it('не отправляет запросы, когда автосохранение выключено', async () => {
  renderHook(() => useCollectionAutosave({ initialId: 'c1', content: content('Тема'), enabled: false }))
  await act(async () => { jest.advanceTimersByTime(2000) })
  expect(global.fetch).not.toHaveBeenCalled()
})
