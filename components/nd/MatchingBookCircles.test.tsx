import { render, screen, within } from '@testing-library/react'
import MatchingBookCircles from './MatchingBookCircles'
import type { MatchingBookCircleView, MatchingBookParticipantView } from './matching-book-types'

const participants: MatchingBookParticipantView[] = Array.from({ length: 6 }, (_, index) => ({
  ref: `r${index + 1}`,
  displayName: `Читатель ${index + 1}`,
  status: 'assigned',
  rank: index + 1,
}))

const circles: MatchingBookCircleView[] = [
  { id: 'circle-1', position: 1, memberRefs: ['r1', 'r2', 'r3'] },
  { id: 'circle-2', position: 2, memberRefs: ['r4', 'r5', 'r6'] },
]

describe('MatchingBookCircles', () => {
  it('renders every circle for a book that formed two circles', () => {
    render(<MatchingBookCircles circles={circles} participants={participants} viewerRef="r1" />)
    expect(screen.getByRole('region', { name: 'Круг 1' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Круг 2' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Круг 2/ })).toBeInTheDocument()
  })

  it('marks exactly one circle as the viewer own', () => {
    render(<MatchingBookCircles circles={circles} participants={participants} viewerRef="r5" />)
    const marked = screen.getAllByRole('heading').filter(heading => /· ваш/.test(heading.textContent ?? ''))
    expect(marked).toHaveLength(1)
    expect(marked[0].textContent).toContain('Круг 2')
    // The viewer reads as «Вы» inside their own circle.
    const own = screen.getByRole('region', { name: 'Круг 2' })
    expect(within(own).getByText('Вы')).toBeInTheDocument()
  })

  it('renders nothing without circles', () => {
    const { container } = render(<MatchingBookCircles circles={[]} participants={participants} viewerRef="r1" />)
    expect(container).toBeEmptyDOMElement()
  })
})
