'use client'

import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/**
 * Обрезано ли описание line-clamp'ом на самом деле. Длина строки не годится: сколько символов
 * влезает в N строк, зависит от ширины колонки — в каталоге, в подборке и при ресайзе она разная.
 * До первого замера (серверный рендер) используем `initialGuess`. Пока описание развёрнуто,
 * clamp снят и мерить нечего — держим последнее значение, чтобы кнопка «Свернуть» не пропала.
 */
export function useDescriptionOverflow(
  ref: RefObject<HTMLElement>,
  text: string,
  expanded: boolean,
  initialGuess: boolean,
): boolean {
  const [overflows, setOverflows] = useState(initialGuess)

  useIsomorphicLayoutEffect(() => {
    const element = ref.current
    if (!element || expanded) return
    const measure = () => setOverflows(element.scrollHeight > element.clientHeight + 1)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, text, expanded])

  return overflows
}
