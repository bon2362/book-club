'use client'

import { useEffect, useId, useState, type ReactNode } from 'react'
import type { WikipediaArticleDocument } from '@/lib/wikipedia/types'
import WikipediaArticle from './WikipediaArticle'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; article: WikipediaArticleDocument }
  | { status: 'error' }

interface Props {
  sourceUrl: string
  children: ReactNode
}

export default function WikipediaEmbed({ sourceUrl, children }: Props) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [open, setOpen] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const readerId = useId()

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    setLoad(prev => (prev.status === 'ready' ? prev : { status: 'loading' }))
    fetch(`/api/wikipedia/article?url=${encodeURIComponent(sourceUrl)}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('upstream')
        return (await response.json()) as WikipediaArticleDocument
      })
      .then(article => {
        if (active) setLoad({ status: 'ready', article })
      })
      .catch(error => {
        if (active && (error as { name?: string })?.name !== 'AbortError') setLoad({ status: 'error' })
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [sourceUrl, attempt])

  function toggle() {
    // A pointer toggle that lands on a text selection must not collapse it.
    if (window.getSelection()?.toString()) return
    setOpen(current => !current)
  }

  function retry() {
    setLoad({ status: 'loading' })
    setAttempt(current => current + 1)
  }

  return (
    <aside className="nd-wikipedia-embed" data-open={open ? 'true' : 'false'}>
      <div className="nd-wikipedia-embed__summary">
        <div className="nd-wikipedia-embed__header">
          <span className="nd-wikipedia-embed__label">
            <span className="nd-wikipedia-embed__mark" aria-hidden="true">
              W
            </span>
            Wikipedia
          </span>
          {load.status === 'ready' && (
            <span className="nd-wikipedia-embed__title">{load.article.title}</span>
          )}
        </div>
        <div className="nd-wikipedia-embed__author">{children}</div>
        <div className="nd-wikipedia-embed__actions">
          {load.status === 'error' ? (
            <>
              <a className="nd-wikipedia-embed__fallback" href={sourceUrl} target="_blank" rel="noopener noreferrer">
                Открыть статью в Wikipedia
              </a>
              <button type="button" className="nd-wikipedia-embed__retry" onClick={retry}>
                Повторить
              </button>
            </>
          ) : (
            <button
              type="button"
              className="nd-wikipedia-embed__toggle"
              aria-expanded={open}
              aria-controls={readerId}
              onClick={toggle}
            >
              {open ? 'Свернуть статью Wikipedia' : 'Читать статью Wikipedia'}
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="nd-wikipedia-embed__reader" id={readerId} role="region" aria-label="Статья Wikipedia">
          <div className="nd-wikipedia-embed__reader-bar">
            <h3 className="nd-wikipedia-embed__reader-title">
              {load.status === 'ready' ? load.article.title : 'Wikipedia'}
            </h3>
            <a className="nd-wikipedia-embed__reader-link" href={sourceUrl} target="_blank" rel="noopener noreferrer">
              Открыть оригинал
            </a>
          </div>
          {load.status === 'ready' ? (
            <WikipediaArticle article={load.article} />
          ) : (
            <p className="nd-wikipedia-embed__status" role="status">
              Загружаем статью…
            </p>
          )}
        </div>
      )}
    </aside>
  )
}
