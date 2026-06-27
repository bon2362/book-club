'use client'

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { WikipediaUrlError, parseWikipediaUrl } from '@/lib/wikipedia/url'
import type { WikipediaTarget } from '@/lib/wikipedia/types'

interface Props {
  initialUrl?: string
  onCancel: () => void
  onInsert: (target: WikipediaTarget) => void
}

const ERROR_MESSAGE = 'Вставьте ссылку на статью вида https://ru.wikipedia.org/wiki/…'

export default function WikipediaInsertDialog({ initialUrl = '', onCancel, onInsert }: Props) {
  const [url, setUrl] = useState(initialUrl)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const errorId = useId()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function submit(event: FormEvent) {
    event.preventDefault()
    try {
      onInsert(parseWikipediaUrl(url))
    } catch (caught) {
      if (caught instanceof WikipediaUrlError) {
        setError(ERROR_MESSAGE)
        return
      }
      throw caught
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onCancel()
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Вставка из Wikipedia"
      onKeyDown={handleKeyDown}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        background: 'rgba(0,0,0,0.55)',
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: 'min(420px, 100%)',
          padding: '1.4rem',
          background: 'var(--bg-input)',
          border: '1px solid var(--border-strong)',
          fontFamily: 'var(--nd-sans)',
        }}
      >
        <h2 style={{ margin: '0 0 1rem', fontFamily: 'var(--nd-serif)', fontSize: '1.2rem', color: 'var(--text)' }}>
          Вставка из Wikipedia
        </h2>
        <label
          htmlFor={inputId}
          style={{
            display: 'block',
            marginBottom: '0.4rem',
            fontSize: '0.6rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          Ссылка на статью Wikipedia
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="url"
          value={url}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={event => {
            setUrl(event.target.value)
            setError(null)
          }}
          placeholder="https://ru.wikipedia.org/wiki/…"
          style={{
            width: '100%',
            padding: '0.5rem 0.6rem',
            border: '1px solid var(--border)',
            borderBottom: '2px solid var(--border-strong)',
            background: 'var(--bg-input)',
            color: 'var(--text)',
            fontFamily: 'var(--nd-sans)',
            fontSize: '0.9rem',
          }}
        />
        {error && (
          <p id={errorId} role="alert" style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: 'var(--accent)' }}>
            {error}
          </p>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1.2rem' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '0.4rem 0.9rem',
              border: '1px solid var(--border-strong)',
              background: 'var(--bg-input)',
              color: 'var(--text)',
              fontFamily: 'var(--nd-sans)',
              fontSize: '0.72rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Отмена
          </button>
          <button
            type="submit"
            style={{
              padding: '0.4rem 0.9rem',
              border: '1px solid var(--text)',
              background: 'var(--text)',
              color: 'var(--bg-input)',
              fontFamily: 'var(--nd-sans)',
              fontSize: '0.72rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Вставить
          </button>
        </div>
      </form>
    </div>
  )
}
