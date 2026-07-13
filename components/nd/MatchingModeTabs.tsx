'use client'

export type MatchingMode = 'books' | 'scenarios'

export default function MatchingModeTabs({
  value,
  onChange,
}: {
  value: MatchingMode
  onChange: (mode: MatchingMode) => void
}) {
  return (
    <div className="nd-mx-mode-tabs" role="tablist" aria-label="Режим матчинга">
      {([
        ['books', 'Книги'],
        ['scenarios', 'Сценарии'],
      ] as const).map(([mode, label]) => (
        <button
          key={mode}
          type="button"
          role="tab"
          id={`matching-tab-${mode}`}
          aria-controls={`matching-panel-${mode}`}
          aria-selected={value === mode}
          tabIndex={value === mode ? 0 : -1}
          className="nd-mx-mode-tab"
          onClick={() => onChange(mode)}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
            event.preventDefault()
            const next = mode === 'books' ? 'scenarios' : 'books'
            onChange(next)
            requestAnimationFrame(() => document.getElementById(`matching-tab-${next}`)?.focus())
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
