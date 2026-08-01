'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import SummaryMarkdown from '../SummaryMarkdown'
import { normalizeDataColor, normalizeEpochColor } from './data-color'
import { formatDateRange } from './format-historical-date'
import type { TimelineEpochView, TimelineEventView } from '@/lib/timeline/view-model'
import TimelineInlineEditor from './TimelineInlineEditor'
import { DEFAULT_TIMELINE_EPOCH_COLOR } from './admin/palette'
import { buttonStyle, readError } from './admin/shared'

interface Props {
  selected: { kind: 'event'; item: TimelineEventView } | { kind: 'epoch'; item: TimelineEpochView } | null
  onClose: () => void
  timelineId?: string
  isAdmin?: boolean
  onChanged?: (keepSelection?: { kind: 'event' | 'epoch'; id: string }) => void
}

/**
 * Основная карточка выбранного элемента — панель над лентой. Отдельный
 * полноэкранный просмотр изображения открывается как модальное окно.
 */
export default function TimelineDetailCard({
  selected,
  onClose,
  timelineId,
  isAdmin = false,
  onChanged = () => {},
}: Props) {
  const [editing, setEditing] = useState(false)
  const [attachError, setAttachError] = useState<string | null>(null)
  const [attaching, setAttaching] = useState(false)
  const [imageOpen, setImageOpen] = useState(false)
  const imagePreviewRef = useRef<HTMLButtonElement>(null)
  const lightboxCloseRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!imageOpen) return
    const opener = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : imagePreviewRef.current
    lightboxCloseRef.current?.focus()
    const handleLightboxKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setImageOpen(false)
      } else if (event.key === 'Tab') {
        event.preventDefault()
        lightboxCloseRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleLightboxKeyDown)
    return () => {
      document.removeEventListener('keydown', handleLightboxKeyDown)
      opener?.focus()
    }
  }, [imageOpen])

  if (selected === null) {
    return (
      <div
        data-testid="timeline-detail-empty"
        style={{
          paddingTop: '1.15rem',
          fontFamily: 'var(--nd-sans)',
          fontSize: '0.8rem',
          color: 'var(--text-muted)',
        }}
      >
        Выберите событие или эпоху на ленте — <b style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>подробности появятся здесь</b>.
      </div>
    )
  }

  const { item } = selected
  const color = selected.kind === 'epoch' ? normalizeEpochColor(item.color) : normalizeDataColor(item.color)
  const dateLabel = selected.kind === 'event'
    ? formatDateRange(selected.item)
    : formatDateRange({ start: selected.item.start, end: selected.item.end })
  const kindLabel = selected.kind === 'event' ? selected.item.typeTitle : 'Эпоха'
  const isPoint = selected.kind === 'event' && selected.item.end === undefined && !selected.item.ongoing

  async function attachLibraryItem() {
    if (!timelineId || selected === null) return
    setAttachError(null)
    setAttaching(true)
    const url = selected.kind === 'event'
      ? `/api/admin/timeline/timelines/${timelineId}/events/${item.id}`
      : `/api/admin/timeline/timelines/${timelineId}/epochs/${item.id}`
    const body = selected.kind === 'event'
      ? { note: '', visible: true }
      : { note: '', color: DEFAULT_TIMELINE_EPOCH_COLOR, visible: true, pinnedLane: null }
    try {
      const response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const message = await readError(response)
      if (message) setAttachError(message)
      else onChanged({ kind: selected.kind, id: item.id })
    } catch {
      setAttachError('Не удалось прикрепить элемент')
    } finally {
      setAttaching(false)
    }
  }

  if (editing && isAdmin && timelineId) {
    return (
      <TimelineInlineEditor
        timelineId={timelineId}
        selected={selected}
        onCancel={() => setEditing(false)}
        onChanged={onChanged}
      />
    )
  }

  return (
    <article
      data-testid="timeline-detail"
      style={{
        paddingTop: '0.35rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', paddingTop: '0.65rem' }}>
        <span
          style={{
            font: '0.72rem/1 var(--nd-mono)',
            color: 'var(--text-secondary)',
            letterSpacing: '0.02em',
          }}
        >
          {dateLabel}
        </span>
        {isPoint ? (
          <span style={{ padding: '0.15rem 0.35rem', boxShadow: 'inset 0 0 0 1px var(--hair)', color: 'var(--text-muted)', font: '0.6rem/1 var(--nd-sans)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Одна дата
          </span>
        ) : null}
        <span aria-hidden="true" style={{ width: '7px', height: '7px', borderRadius: selected.kind === 'event' ? '50%' : 0, background: color, flex: 'none' }} />
        <span style={{ color: 'var(--text-muted)', font: '0.6rem/1 var(--nd-sans)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          {kindLabel}
        </span>
        {isAdmin && timelineId && !item.isLibrary ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            style={{
              marginLeft: '0.35rem',
              padding: '0.18rem 0.55rem 0.18rem 0.9rem',
              background: 'none',
              border: 'none',
              boxShadow: 'inset 1px 0 0 var(--hair)',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              font: '0.6rem/1 var(--nd-sans)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
          >
            Править
          </button>
        ) : null}
        {isAdmin && timelineId && item.isLibrary ? (
          <button
            type="button"
            disabled={attaching}
            onClick={() => void attachLibraryItem()}
            style={{ ...buttonStyle('primary'), marginLeft: '0.35rem', cursor: attaching ? 'wait' : 'pointer' }}
          >
            {attaching ? 'Прикрепляем…' : '+ Прикрепить'}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть карточку"
          style={{
            marginLeft: isAdmin && timelineId ? 0 : 'auto',
            paddingLeft: isAdmin && timelineId ? '0.9rem' : 0,
            boxShadow: isAdmin && timelineId ? 'inset 1px 0 0 var(--hair)' : 'none',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--nd-sans)',
            fontSize: '0.6rem',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: 'var(--text-muted)',
          }}
        >
          Закрыть
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.1rem', paddingTop: '0.35rem' }}>
        {item.imageUrl ? (
          <figure className="nd-timeline-detail-media">
            <button
              ref={imagePreviewRef}
              type="button"
              className="nd-timeline-detail-image-button"
              aria-label={`Открыть изображение: ${item.imageCaption ?? item.title}`}
              onClick={() => setImageOpen(true)}
            >
              <Image
                src={item.imageUrl}
                alt={item.imageCaption ?? item.title}
                fill
                sizes="(min-width: 768px) 280px, 45vw"
                unoptimized
                style={{ objectFit: 'contain' }}
              />
            </button>
            {item.imageCaption ? <figcaption>{item.imageCaption}</figcaption> : null}
          </figure>
        ) : null}

        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 style={{ margin: '0.3rem 0 0', color: 'var(--text)', font: '700 1.45rem/1.2 var(--nd-serif)', letterSpacing: '-0.015em' }}>
            {item.title}
          </h2>

          {item.description ? <div className="nd-timeline-detail-body"><SummaryMarkdown markdown={item.description} /></div> : null}

          {item.note ? (
            <div className="nd-timeline-detail-note"><SummaryMarkdown markdown={item.note} /></div>
          ) : null}
          {item.isLibrary ? <p style={{ color: 'var(--text-muted)', font: 'italic 0.72rem/1.4 var(--nd-sans)' }}>Есть в общей базе · ещё не прикреплено к этой ленте</p> : null}
          {attachError ? <p role="alert" style={{ color: 'var(--accent)', fontSize: '0.75rem' }}>{attachError}</p> : null}
        </div>
      </div>
      {imageOpen && item.imageUrl ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={item.imageCaption ?? item.title}
          className="nd-timeline-lightbox"
          onClick={() => setImageOpen(false)}
        >
          <figure className="nd-timeline-lightbox-content" onClick={(event) => event.stopPropagation()}>
            <button
              ref={lightboxCloseRef}
              type="button"
              className="nd-timeline-lightbox-close"
              aria-label="Закрыть изображение"
              onClick={() => setImageOpen(false)}
            >
              Закрыть
            </button>
            <div className="nd-timeline-lightbox-image">
              <Image
                src={item.imageUrl}
                alt={item.imageCaption ?? item.title}
                fill
                sizes="90vw"
                unoptimized
                style={{ objectFit: 'contain' }}
              />
            </div>
            {item.imageCaption ? <figcaption>{item.imageCaption}</figcaption> : null}
          </figure>
        </div>
      ) : null}
    </article>
  )
}
