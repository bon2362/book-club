'use client'

import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { createViewportTransform, panRange, zoomRangeAroundPointer, type VisibleRange } from '@/lib/timeline'

/**
 * Навигация по ленте: колесо мыши (масштаб с сохранением точки под курсором и
 * панорама), перетаскивание полотна, горячие клавиши. Перенесено из
 * `~/documents/timeline` без изменений логики.
 */

const ZOOM_IN_FACTOR = 0.8
const ZOOM_OUT_FACTOR = 1.25
const MIN_SPAN = 1 / 366
const MAX_SPAN = 10_000_000

export interface TimelineNavigationOptions {
  rootRef: RefObject<HTMLElement | null>
  range: VisibleRange
  width: number
  onViewportChange(range: VisibleRange): void
  onFit(): void
  onDraggingChange?(dragging: boolean): void
}

export interface TimelineNavigationCommands {
  zoomIn(): void
  zoomOut(): void
  fit(): void
}

function isTextEntry(element: Element | null): boolean {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    (element instanceof HTMLElement && element.isContentEditable)
  )
}

export function useTimelineNavigation({
  rootRef,
  range,
  width,
  onViewportChange,
  onFit,
  onDraggingChange,
}: TimelineNavigationOptions): TimelineNavigationCommands {
  const optionsRef = useRef({ range, width, onViewportChange, onFit, onDraggingChange })
  optionsRef.current = { range, width, onViewportChange, onFit, onDraggingChange }
  const activeRef = useRef(false)
  const dragRef = useRef<{ pointerId: number; lastX: number } | undefined>(undefined)

  const zoomAtCenter = useCallback((factor: number): void => {
    const current = optionsRef.current
    const center = (current.range.start + current.range.end) / 2
    current.onViewportChange(
      zoomRangeAroundPointer(current.range, center, factor, { minSpan: MIN_SPAN, maxSpan: MAX_SPAN }),
    )
  }, [])

  const zoomIn = useCallback(() => zoomAtCenter(ZOOM_IN_FACTOR), [zoomAtCenter])
  const zoomOut = useCallback(() => zoomAtCenter(ZOOM_OUT_FACTOR), [zoomAtCenter])
  const fit = useCallback(() => optionsRef.current.onFit(), [])

  useEffect(() => {
    const root = rootRef.current
    if (root === null) return
    const rootElement = root

    const activate = () => {
      activeRef.current = true
    }
    const deactivateIfOutside = () => {
      activeRef.current = rootElement.contains(document.activeElement)
    }

    function handleWheel(event: WheelEvent): void {
      const current = optionsRef.current
      if (event.ctrlKey) {
        event.preventDefault()
        const bounds = rootElement.getBoundingClientRect()
        const x = Math.min(current.width, Math.max(0, event.clientX - bounds.left))
        const pointerValue = createViewportTransform(current.range, current.width).fromX(x)
        current.onViewportChange(
          zoomRangeAroundPointer(
            current.range,
            pointerValue,
            event.deltaY < 0 ? ZOOM_IN_FACTOR : ZOOM_OUT_FACTOR,
            { minSpan: MIN_SPAN, maxSpan: MAX_SPAN },
          ),
        )
        return
      }

      // Горизонтальная прокрутка ленты; вертикальная прокрутка страницы
      // остаётся за браузером, иначе мимо ленты не пролистать.
      const pixelDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : 0
      if (pixelDelta === 0) return
      event.preventDefault()
      const unitsPerPixel = (current.range.end - current.range.start) / current.width
      current.onViewportChange(panRange(current.range, pixelDelta * unitsPerPixel))
    }

    function handlePointerDown(event: PointerEvent): void {
      if (event.button !== 0) return
      const target = event.target
      if (
        target instanceof Element &&
        target.closest('button, a, input, textarea, select, label, [contenteditable="true"]')
      ) {
        return
      }
      dragRef.current = { pointerId: event.pointerId, lastX: event.clientX }
    }

    function handlePointerMove(event: PointerEvent): void {
      const drag = dragRef.current
      if (drag === undefined || drag.pointerId !== event.pointerId) return
      const current = optionsRef.current
      const pixelDelta = event.clientX - drag.lastX
      if (pixelDelta === 0) return
      current.onDraggingChange?.(true)
      drag.lastX = event.clientX
      const unitsPerPixel = (current.range.end - current.range.start) / current.width
      current.onViewportChange(panRange(current.range, -pixelDelta * unitsPerPixel))
    }

    function handlePointerUp(event: PointerEvent): void {
      if (dragRef.current?.pointerId === event.pointerId) {
        dragRef.current = undefined
        optionsRef.current.onDraggingChange?.(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (!activeRef.current || isTextEntry(document.activeElement)) return
      if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        zoomIn()
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault()
        zoomOut()
      } else if (event.key.toLowerCase() === 'f') {
        event.preventDefault()
        fit()
      }
    }

    rootElement.addEventListener('mouseenter', activate)
    rootElement.addEventListener('mouseleave', deactivateIfOutside)
    rootElement.addEventListener('focusin', activate)
    rootElement.addEventListener('focusout', deactivateIfOutside)
    rootElement.addEventListener('wheel', handleWheel, { passive: false })
    rootElement.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      rootElement.removeEventListener('mouseenter', activate)
      rootElement.removeEventListener('mouseleave', deactivateIfOutside)
      rootElement.removeEventListener('focusin', activate)
      rootElement.removeEventListener('focusout', deactivateIfOutside)
      rootElement.removeEventListener('wheel', handleWheel)
      rootElement.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('keydown', handleKeyDown)
      optionsRef.current.onDraggingChange?.(false)
    }
  }, [fit, rootRef, zoomIn, zoomOut])

  return { zoomIn, zoomOut, fit }
}
