import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StatusMenu } from './ProfileDrawer'

jest.mock('next-auth/react', () => ({
  signOut: jest.fn(),
  useSession: jest.fn(() => ({ data: null })),
}))

jest.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PointerSensor: jest.fn(),
  TouchSensor: jest.fn(),
  closestCenter: jest.fn(),
  useSensor: jest.fn(),
  useSensors: jest.fn(() => []),
}))

jest.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  verticalListSortingStrategy: {},
  arrayMove: jest.fn((items: unknown[]) => items),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: jest.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}))

jest.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: jest.fn(() => '') } },
}))

describe('ProfileDrawer StatusMenu summary action', () => {
  beforeEach(() => {
    delete (window as Partial<Window>).location
    Object.defineProperty(window, 'location', { value: { href: '' }, writable: true })
  })

  it('opens a summary draft for read books', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ summary: { id: 's1' } }),
    }) as jest.Mock

    render(<StatusMenu current="read" bookId="b1" onChange={() => {}} />)

    fireEvent.click(screen.getByRole('menuitem', { name: /написать саммари/i }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/summaries/by-book/b1', expect.objectContaining({ method: 'POST' })))
    expect(window.location.href).toBe('/summaries/s1/edit')
  })
})
