import { render, screen, fireEvent } from '@testing-library/react'
import MatchingConfirmationDialog from './MatchingConfirmationDialog'

const base = {
  from: { bookTitle: 'Старая книга', members: ['Анна', 'Борис'] },
  to: { bookTitle: 'Новая книга', members: ['Анна', 'Вера'] },
  onConfirm: jest.fn(),
  onCancel: jest.fn(),
}

beforeEach(() => {
  base.onConfirm.mockClear()
  base.onCancel.mockClear()
})

test('renders nothing when closed', () => {
  const { container } = render(<MatchingConfirmationDialog open={false} {...base} />)
  expect(container).toBeEmptyDOMElement()
})

test('shows the old and new circle book + composition when switching', () => {
  render(<MatchingConfirmationDialog open {...base} />)
  expect(screen.getByText('Старая книга')).toBeInTheDocument()
  expect(screen.getByText('Новая книга')).toBeInTheDocument()
  expect(screen.getByText(/Борис/)).toBeInTheDocument()
  expect(screen.getByText(/Вера/)).toBeInTheDocument()
})

test('omits the old-circle block when there is no current confirmation', () => {
  render(<MatchingConfirmationDialog open {...base} from={null} />)
  expect(screen.queryByText('Старая книга')).toBeNull()
  expect(screen.getByText('Новая книга')).toBeInTheDocument()
})

test('fires confirm and cancel callbacks', () => {
  render(<MatchingConfirmationDialog open {...base} />)
  fireEvent.click(screen.getByRole('button', { name: /подтверд/i }))
  expect(base.onConfirm).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: /отмен/i }))
  expect(base.onCancel).toHaveBeenCalledTimes(1)
})
