/** @jest-environment jsdom */
import { act, fireEvent, render, screen } from '@testing-library/react'
import CollectionBookSearch from './CollectionBookSearch'

jest.mock('./CoverImage', () => ({ __esModule: true, default: () => <span /> }))

const found = { id: 'b1', title: 'Долг', author: 'Гребер', coverUrl: null, year: '2011', isArticle: false, clubStatus: null }

beforeEach(() => {
  jest.useFakeTimers()
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ books: [found, { ...found, id: 'b2', title: 'Уже есть' }] }) }) as never
})
afterEach(() => jest.useRealTimers())

it('показывает найденное без уже добавленных и добавляет по клику', async () => {
  const onAdd = jest.fn()
  render(<CollectionBookSearch excludeIds={new Set(['b2'])} onAdd={onAdd} />)
  fireEvent.change(screen.getByPlaceholderText('Найти книгу по названию или автору'), { target: { value: 'до' } })
  await act(async () => { jest.advanceTimersByTime(300) })
  expect(screen.queryByText('Уже есть')).toBeNull()
  fireEvent.click(screen.getByRole('option', { name: /Долг/ }))
  expect(onAdd).toHaveBeenCalledWith(found)
})

it('объясняет пустой результат', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ books: [] }) })
  render(<CollectionBookSearch excludeIds={new Set()} onAdd={jest.fn()} />)
  fireEvent.change(screen.getByPlaceholderText('Найти книгу по названию или автору'), { target: { value: 'нет такой' } })
  await act(async () => { jest.advanceTimersByTime(300) })
  expect(screen.getByText(/сначала предложите её в каталоге/)).toBeInTheDocument()
})
