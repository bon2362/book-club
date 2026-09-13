/** @jest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react'
import CollectionsIndex from './CollectionsIndex'
jest.mock('@/lib/analytics', () => ({ track: jest.fn() })); jest.mock('./Header', () => ({ __esModule: true, default: () => <header /> })); jest.mock('./AuthModal', () => ({ __esModule: true, default: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div role="dialog">Вход</div> : null })); jest.mock('./CollectionStackCard', () => ({ __esModule: true, default: ({ collection }: { collection: { title: string } }) => <a>{collection.title}</a> }))
beforeEach(() => localStorage.clear())
test('пустое состояние', () => { render(<CollectionsIndex collections={[]} isLoggedIn={false} isAdmin={false} openCreate={false} />); expect(screen.getByText(/Подборок пока нет/)).toBeInTheDocument() })
test('гость сохраняет намерение собрать', () => { render(<CollectionsIndex collections={[]} isLoggedIn={false} isAdmin={false} openCreate={false} />); fireEvent.click(screen.getByRole('button', { name: /Собрать первую/ })); expect(screen.getByRole('dialog')).toBeInTheDocument(); expect(localStorage.getItem('collectionCreateIntent')).not.toBeNull() })
