/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react'
import { act } from 'react'
import { useAutoDismiss } from './useAutoDismiss'

// Заменяет два медленных Playwright-сценария из e2e/priority-hint.spec.ts
// («тост закрывается через 20s», «hover ставит таймер на паузу»), которые
// тратили ~31s реального ожидания. Здесь — мгновенно через fake timers.
describe('useAutoDismiss', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
  })

  it('вызывает onDismiss по истечении delayMs', () => {
    const onDismiss = jest.fn()
    renderHook(() => useAutoDismiss(true, false, onDismiss, 20000))

    expect(onDismiss).not.toHaveBeenCalled()
    act(() => { jest.advanceTimersByTime(19999) })
    expect(onDismiss).not.toHaveBeenCalled()
    act(() => { jest.advanceTimersByTime(1) })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('не запускает таймер пока visible=false', () => {
    const onDismiss = jest.fn()
    renderHook(() => useAutoDismiss(false, false, onDismiss, 20000))
    act(() => { jest.advanceTimersByTime(60000) })
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('пауза останавливает таймер, и тост остаётся (аналог hover)', () => {
    const onDismiss = jest.fn()
    const { rerender } = renderHook(
      ({ paused }) => useAutoDismiss(true, paused, onDismiss, 20000),
      { initialProps: { paused: false } },
    )

    act(() => { jest.advanceTimersByTime(10000) })
    // hover → пауза
    rerender({ paused: true })
    // даже спустя время больше штатного таймера — не закрывается
    act(() => { jest.advanceTimersByTime(60000) })
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('снятие паузы запускает отсчёт заново с полного delayMs', () => {
    const onDismiss = jest.fn()
    const { rerender } = renderHook(
      ({ paused }) => useAutoDismiss(true, paused, onDismiss, 20000),
      { initialProps: { paused: true } },
    )

    // курсор увели → пауза снята
    rerender({ paused: false })
    act(() => { jest.advanceTimersByTime(19999) })
    expect(onDismiss).not.toHaveBeenCalled()
    act(() => { jest.advanceTimersByTime(1) })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('смена идентичности onDismiss между ре-рендерами НЕ перезапускает таймер', () => {
    const first = jest.fn()
    const second = jest.fn()
    const { rerender } = renderHook(
      ({ cb }) => useAutoDismiss(true, false, cb, 20000),
      { initialProps: { cb: first } },
    )

    act(() => { jest.advanceTimersByTime(15000) })
    // новый колбэк (как новая стрелочная функция каждый рендер) не должен
    // сбрасывать уже идущий таймер
    rerender({ cb: second })
    act(() => { jest.advanceTimersByTime(5000) })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('очищает таймер при размонтировании', () => {
    const onDismiss = jest.fn()
    const { unmount } = renderHook(() => useAutoDismiss(true, false, onDismiss, 20000))
    unmount()
    act(() => { jest.advanceTimersByTime(60000) })
    expect(onDismiss).not.toHaveBeenCalled()
  })
})
