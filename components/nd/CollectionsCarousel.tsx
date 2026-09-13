'use client'

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { track } from '@/lib/analytics'

const GAP = 14
const EDGE_TOLERANCE = 6

export default function CollectionsCarousel({ children }: { children: ReactNode }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)
  const scrolledOnce = useRef(false)

  const check = useCallback(() => {
    const element = trackRef.current
    if (!element) return
    setAtStart(element.scrollLeft < EDGE_TOLERANCE)
    setAtEnd(element.scrollLeft + element.clientWidth >= element.scrollWidth - EDGE_TOLERANCE)
  }, [])

  useEffect(() => {
    check()
    const element = trackRef.current
    if (!element) return
    const observer = new ResizeObserver(check)
    observer.observe(element)
    return () => observer.disconnect()
  }, [check, children])

  function handleScroll() {
    check()
    if (!scrolledOnce.current) {
      scrolledOnce.current = true
      track('collections_carousel_scrolled', {})
    }
  }

  function nudge(direction: 1 | -1) {
    const element = trackRef.current
    if (!element) return
    const card = element.firstElementChild as HTMLElement | null
    const step = card ? card.getBoundingClientRect().width + GAP : element.clientWidth * 0.8
    element.scrollBy({ left: direction * step, behavior: 'smooth' })
  }

  const maskClass = ['collections-carousel', atStart ? 'at-start' : '', atEnd ? 'at-end' : ''].filter(Boolean).join(' ')

  return (
    <div className="collections-carousel-wrap">
      <div ref={trackRef} className={maskClass} onScroll={handleScroll} data-testid="collections-carousel">
        {Children.map(children, child => <div className="collections-carousel-item">{child}</div>)}
      </div>
      {!atStart && <button type="button" aria-label="Назад" className="collections-carousel-arrow prev" onClick={() => nudge(-1)}>←</button>}
      {!atEnd && <button type="button" aria-label="Вперёд" className="collections-carousel-arrow next" onClick={() => nudge(1)}>→</button>}
    </div>
  )
}
