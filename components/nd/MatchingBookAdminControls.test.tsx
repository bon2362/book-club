import { fireEvent, render, screen } from '@testing-library/react'
import MatchingBookAdminControls from './MatchingBookAdminControls'
import type { MatchingBookView } from './matching-book-types'

const first: MatchingBookView = {
  bookId: 'b1', title: 'Первая', author: 'Автор', coverUrl: null, intersectionCount: 1,
  formedAt: '2026-07-13T10:00:00Z', currentViability: 'viable', viewerStatus: 'interest',
  participants: [{ ref: 'p1', adminUserId: 'u1', displayName: 'Анна', status: 'assigned', rank: 1 }],
  circles: [{ id: 'c1', position: 1, memberRefs: ['p1'] }], unplacedParticipantRefs: [],
  allowedActions: { conditional: false, hard: false, cancelHard: false },
}
const second = { ...first, bookId: 'b2', title: 'Вторая', participants: [], circles: [] }

describe('MatchingBookAdminControls', () => {
  it('offers placement, transfer, unassign, circle and removal commands', () => {
    const onAction = jest.fn()
    jest.spyOn(window, 'confirm').mockReturnValue(true)
    render(<MatchingBookAdminControls book={first} books={[first, second]} adminParticipants={[
      { ref: 'p1', displayName: 'Анна', adminUserId: 'u1', assignmentBookId: 'b1' },
      { ref: 'p2', displayName: 'Борис', adminUserId: 'u2', assignmentBookId: null },
    ]} pending={false} onAction={onAction} />)
    fireEvent.click(screen.getByRole('button', { name: 'Управлять составом' }))
    fireEvent.change(screen.getByLabelText('Перенести Анна в другую книгу'), { target: { value: 'b2' } })
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'assign', destinationBookId: 'b2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Снять' }))
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'unassign' }))
    fireEvent.click(screen.getByRole('button', { name: 'Удалить круг 1' }))
    expect(onAction).toHaveBeenCalledWith({ action: 'deleteCircle', circleId: 'c1' })
    fireEvent.click(screen.getByRole('button', { name: 'Исключить' }))
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'removeParticipant' }))
    fireEvent.change(screen.getByLabelText('Записать участника'), { target: { value: 'u2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Записать сюда' }))
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({
      action: 'assign', participant: expect.objectContaining({ adminUserId: 'u2' }),
    }))
  })
})
