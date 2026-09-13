/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react'
import HomeCollectionsBlock from './HomeCollectionsBlock'
import { track } from '@/lib/analytics'

jest.mock('@/lib/analytics', () => ({ track: jest.fn() }))
jest.mock('./CollectionStackCard', () => ({
  __esModule: true,
  default: ({ collection, onOpen }: { collection: { title: string }; onOpen: () => void }) => <a onClick={onOpen}>{collection.title}</a>,
}))

beforeAll(() => {
  global.ResizeObserver = class { observe() {} disconnect() {} } as never
})

const item = (id: string) => ({ id, slug: id, title: `Подборка ${id}`, textsCount: 3, covers: [], sortAt: '' })

it('renders the heading, subtitle, and cards', () => {
  render(<HomeCollectionsBlock collections={[item('a'), item('b')]} onCreate={jest.fn()} />)

  expect(screen.getByRole('heading', { name: 'Подборки' })).toBeInTheDocument()
  expect(screen.getByText('Книги, объединённые одной темой')).toBeInTheDocument()
  expect(screen.getByText('Подборка b')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Все подборки' })).toHaveAttribute('href', '/collections')
})

it('shows the empty state with an invitation to create a collection', () => {
  const onCreate = jest.fn()
  render(<HomeCollectionsBlock collections={[]} onCreate={onCreate} />)

  expect(screen.getByText(/Пока ни одной подборки/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Собрать первую подборку' }))
  expect(onCreate).toHaveBeenCalled()
})

it('tracks card opening with the home block source', () => {
  render(<HomeCollectionsBlock collections={[item('a')]} onCreate={jest.fn()} />)

  fireEvent.click(screen.getByText('Подборка a'))
  expect(track).toHaveBeenCalledWith('collections_opened', { source: 'home_block', collection_id: 'a' })
})
