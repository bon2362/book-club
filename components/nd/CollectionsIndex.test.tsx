/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react'
import CollectionsIndex from './CollectionsIndex'

jest.mock('@/lib/analytics', () => ({ track: jest.fn() }))
jest.mock('./Header', () => ({ __esModule: true, default: () => <header /> }))
jest.mock('./AuthModal', () => ({
  __esModule: true,
  default: ({ isOpen, title }: { isOpen: boolean; title?: string }) => (isOpen ? <div role="dialog">{title}</div> : null),
}))
jest.mock('./CollectionStackCard', () => ({
  __esModule: true,
  default: ({ collection }: { collection: { title: string } }) => <a>{collection.title}</a>,
}))

beforeEach(() => localStorage.clear())

const item = (id: string) => ({ id, slug: id, title: `Подборка ${id}`, textsCount: 2, covers: [], sortAt: '' })

it('пустое состояние с приглашением', () => {
  render(<CollectionsIndex collections={[]} isLoggedIn={false} isAdmin={false} openCreate={false} />)
  expect(screen.getByText(/Подборок пока нет/)).toBeInTheDocument()
})

it('заголовок, подзаголовок и счётчик', () => {
  render(<CollectionsIndex collections={[item('a'), item('b')]} isLoggedIn isAdmin={false} openCreate={false} />)
  expect(screen.getByRole('heading', { name: 'Все подборки' })).toBeInTheDocument()
  expect(screen.getByText(/Собраны участниками клуба/)).toBeInTheDocument()
  expect(screen.getByText('2 подборки')).toBeInTheDocument()
})

it('гость нажимает «Собрать» — окно входа и сохранённое намерение', () => {
  render(<CollectionsIndex collections={[]} isLoggedIn={false} isAdmin={false} openCreate={false} />)
  fireEvent.click(screen.getByRole('button', { name: 'Собрать первую' }))
  expect(screen.getByRole('dialog')).toHaveTextContent('Чтобы собрать подборку, войдите')
  expect(localStorage.getItem('collectionCreateIntent')).not.toBeNull()
})
