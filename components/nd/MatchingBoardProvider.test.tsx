import { render, screen, act } from '@testing-library/react'
import MatchingBoardProvider, { useMatchingBoard } from './MatchingBoardProvider'

function Probe() {
  const { pending, beginPending, endPending } = useMatchingBoard()
  return (
    <>
      <span data-testid="pending">{pending ? 'yes' : 'no'}</span>
      <button onClick={beginPending}>begin</button>
      <button onClick={endPending}>end</button>
    </>
  )
}

describe('MatchingBoardProvider (#315 loader)', () => {
  it('beginPending включает pending', () => {
    render(
      <MatchingBoardProvider stateVersion={1}>
        <Probe />
      </MatchingBoardProvider>,
    )
    expect(screen.getByTestId('pending').textContent).toBe('no')
    act(() => {
      screen.getByText('begin').click()
    })
    expect(screen.getByTestId('pending').textContent).toBe('yes')
  })

  it('новый stateVersion от сервера гасит pending', () => {
    const { rerender } = render(
      <MatchingBoardProvider stateVersion={1}>
        <Probe />
      </MatchingBoardProvider>,
    )
    act(() => {
      screen.getByText('begin').click()
    })
    expect(screen.getByTestId('pending').textContent).toBe('yes')

    // router.refresh() приносит новый stateVersion → loader снимается
    rerender(
      <MatchingBoardProvider stateVersion={2}>
        <Probe />
      </MatchingBoardProvider>,
    )
    expect(screen.getByTestId('pending').textContent).toBe('no')
  })

  it('тот же stateVersion pending не трогает', () => {
    const { rerender } = render(
      <MatchingBoardProvider stateVersion={5}>
        <Probe />
      </MatchingBoardProvider>,
    )
    act(() => {
      screen.getByText('begin').click()
    })
    rerender(
      <MatchingBoardProvider stateVersion={5}>
        <Probe />
      </MatchingBoardProvider>,
    )
    expect(screen.getByTestId('pending').textContent).toBe('yes')
  })

  it('safety-таймаут гасит pending без нового stateVersion', () => {
    jest.useFakeTimers()
    try {
      render(
        <MatchingBoardProvider stateVersion={1}>
          <Probe />
        </MatchingBoardProvider>,
      )
      act(() => {
        screen.getByText('begin').click()
      })
      expect(screen.getByTestId('pending').textContent).toBe('yes')
      act(() => {
        jest.advanceTimersByTime(6_000)
      })
      expect(screen.getByTestId('pending').textContent).toBe('no')
    } finally {
      jest.useRealTimers()
    }
  })

  it('endPending гасит pending сразу (путь ошибки мутации)', () => {
    render(
      <MatchingBoardProvider stateVersion={1}>
        <Probe />
      </MatchingBoardProvider>,
    )
    act(() => {
      screen.getByText('begin').click()
    })
    expect(screen.getByTestId('pending').textContent).toBe('yes')
    act(() => {
      screen.getByText('end').click()
    })
    expect(screen.getByTestId('pending').textContent).toBe('no')
  })

  it('без провайдера хук отдаёт безопасный no-op (pending=false)', () => {
    render(<Probe />)
    expect(screen.getByTestId('pending').textContent).toBe('no')
    // beginPending не должен падать
    act(() => {
      screen.getByText('begin').click()
    })
    expect(screen.getByTestId('pending').textContent).toBe('no')
  })
})
