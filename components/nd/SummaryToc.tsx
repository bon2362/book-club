'use client'

import { useEffect, useRef, useState } from 'react'
import type { TocHeading } from '@/lib/summary-toc'

export default function SummaryToc({ headings }: { headings: TocHeading[] }) {
  const [activeId, setActiveId] = useState(headings[0]?.id ?? '')
  const [open, setOpen] = useState(false)
  const visibleRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const els = headings
      .map(h => document.getElementById(h.id))
      .filter((el): el is HTMLElement => el !== null)
    if (els.length === 0) return

    const observer = new IntersectionObserver(
      entries => {
        const visible = visibleRef.current
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id)
          else visible.delete(entry.target.id)
        }
        const firstVisible = headings.find(h => visible.has(h.id))
        if (firstVisible) setActiveId(firstVisible.id)
      },
      { rootMargin: '-15% 0px -70% 0px', threshold: 0 },
    )
    els.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [headings])

  const activeText = headings.find(h => h.id === activeId)?.text ?? headings[0]?.text ?? ''

  const go = (id: string) => (event: React.MouseEvent) => {
    event.preventDefault()
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    setActiveId(id)
    setOpen(false)
  }

  const list = (variant: 'rail' | 'sheet') => (
    <ul className={`summary-toc__list summary-toc__list--${variant}`}>
      {headings.map(h => (
        <li key={h.id}>
          <a
            href={`#${h.id}`}
            onClick={go(h.id)}
            aria-current={h.id === activeId ? 'true' : undefined}
            className={`summary-toc__link${h.id === activeId ? ' is-active' : ''}`}
          >
            {h.text}
          </a>
        </li>
      ))}
    </ul>
  )

  return (
    <div className="summary-toc">
      {/* Десктоп: sticky-рукав */}
      <nav className="summary-toc__rail" aria-label="Разделы статьи">
        <div className="summary-toc__eyebrow t-eyebrow">Содержание</div>
        {list('rail')}
      </nav>

      {/* Мобилка: sticky-бар + нижний лист */}
      <div className="summary-toc__bar">
        <button
          type="button"
          className="summary-toc__bar-button"
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
        >
          <span className="summary-toc__bar-icon" aria-hidden="true">≡</span>
          <span className="summary-toc__bar-current">{activeText}</span>
          <span className="summary-toc__bar-caret" aria-hidden="true">{open ? '▴' : '▾'}</span>
        </button>
      </div>

      {open && (
        <>
          <div className="summary-toc__overlay" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="summary-toc__sheet" role="dialog" aria-label="Разделы статьи">
            <div className="summary-toc__eyebrow t-eyebrow">Содержание</div>
            {list('sheet')}
          </div>
        </>
      )}
    </div>
  )
}
