import { renderHook, act } from '@testing-library/react'
import { ScrollHideProvider, useScrollHide } from '@/lib/scroll-hide-context'

describe('useScrollHide', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'scrollY', { writable: true, configurable: true, value: 0 })
  })

  function fireScroll(y: number) {
    Object.defineProperty(window, 'scrollY', { writable: true, configurable: true, value: y })
    window.dispatchEvent(new Event('scroll'))
  }

  it('starts as not hidden', () => {
    const { result } = renderHook(() => useScrollHide(), { wrapper: ScrollHideProvider })
    expect(result.current.isHidden).toBe(false)
  })

  it('hides when scrolling down past threshold', () => {
    const { result } = renderHook(() => useScrollHide(), { wrapper: ScrollHideProvider })
    act(() => { fireScroll(100) })
    expect(result.current.isHidden).toBe(true)
  })

  it('shows when scrolling up', () => {
    const { result } = renderHook(() => useScrollHide(), { wrapper: ScrollHideProvider })
    act(() => { fireScroll(100) })
    act(() => { fireScroll(50) })
    expect(result.current.isHidden).toBe(false)
  })

  it('does not hide when scrollY below threshold (10-60px)', () => {
    const { result } = renderHook(() => useScrollHide(), { wrapper: ScrollHideProvider })
    act(() => { fireScroll(30) })
    expect(result.current.isHidden).toBe(false)
  })

  it('forces visible when at top (scrollY < 10)', () => {
    const { result } = renderHook(() => useScrollHide(), { wrapper: ScrollHideProvider })
    act(() => { fireScroll(100) }) // hide
    act(() => { fireScroll(5) })   // back to top
    expect(result.current.isHidden).toBe(false)
  })
})
