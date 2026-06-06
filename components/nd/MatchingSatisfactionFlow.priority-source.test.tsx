import { render } from '@testing-library/react'

const refresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: () => refresh() }) }))

jest.mock('./MatchingPersonalList', () => {
  return {
    __esModule: true,
    default: jest.fn(() => null),
  }
})

import MatchingSatisfactionFlow from './MatchingSatisfactionFlow'
import MatchingPersonalList from './MatchingPersonalList'

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }),
  })
  window.scrollTo = () => {}
})

beforeEach(() => {
  refresh.mockClear()
  jest.mocked(MatchingPersonalList).mockClear()
})

const base = { sessionId: 's1', books: [], bookParticipants: [], viewingUserId: 'u1' }

test('gate phase marks priority mutations as coming from the preliminary priority screen', () => {
  render(<MatchingSatisfactionFlow phase="gate" {...base} />)

  expect(jest.mocked(MatchingPersonalList)).toHaveBeenCalledWith(
    expect.objectContaining({ priorityMutationSource: 'matching_priority_gate' }),
    expect.anything(),
  )
})

test('board phase keeps regular matching priority source', () => {
  render(<MatchingSatisfactionFlow phase="board" {...base} />)

  expect(jest.mocked(MatchingPersonalList)).toHaveBeenCalledWith(
    expect.objectContaining({ priorityMutationSource: undefined }),
    expect.anything(),
  )
})
