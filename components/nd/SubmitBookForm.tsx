'use client'

import { useState, useEffect, useCallback } from 'react'

interface Props {
  isOpen: boolean
  onClose: () => void
  topics: string[]
  initialTopic?: string
  initialAuthor?: string
}

type FormStatus = 'idle' | 'submitting' | 'success' | 'error'

const inputStyle: React.CSSProperties = {
  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
  fontSize: '0.85rem',
  color: '#111',
  background: '#fff',
  borderTop: '1px solid #E5E5E5',
  borderRight: '1px solid #E5E5E5',
  borderLeft: '1px solid #E5E5E5',
  borderBottom: '2px solid #111',
  padding: '0.5rem 0.6rem',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

const inputErrorStyle: React.CSSProperties = {
  ...inputStyle,
  borderTop: '1px solid #C0603A',
  borderRight: '1px solid #C0603A',
  borderLeft: '1px solid #C0603A',
  borderBottom: '2px solid #C0603A',
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#111',
  display: 'block',
  marginBottom: '0.3rem',
}

const errorTextStyle: React.CSSProperties = {
  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
  fontSize: '0.72rem',
  color: '#C0603A',
  marginTop: '0.25rem',
}

export default function SubmitBookForm({ isOpen, onClose, topics, initialTopic, initialAuthor }: Props) {
  const [status, setStatus] = useState<FormStatus>('idle')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [title, setTitle] = useState('')
  const [topic, setTopic] = useState('')
  const [author, setAuthor] = useState('')
  const [pages, setPages] = useState('')
  const [publishedDate, setPublishedDate] = useState('')
  const [textUrl, setTextUrl] = useState('')
  const [description, setDescription] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [whyRead, setWhyRead] = useState('')

  const handleClose = useCallback(() => {
    if (status === 'submitting') return
    onClose()
  }, [status, onClose])

  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleClose])

  // Reset form when closed / pre-fill when opened
  useEffect(() => {
    if (!isOpen) {
      setStatus('idle')
      setErrors({})
      setTitle('')
      setTopic('')
      setAuthor('')
      setPages('')
      setPublishedDate('')
      setTextUrl('')
      setDescription('')
      setCoverUrl('')
      setWhyRead('')
    } else {
      if (initialTopic) setTopic(initialTopic)
      if (initialAuthor) setAuthor(initialAuthor)
    }
  }, [isOpen, initialTopic, initialAuthor])

  function validateField(name: string, value: string) {
    if (['title', 'author', 'whyRead'].includes(name) && !value.trim()) {
      setErrors(e => ({ ...e, [name]: 'Обязательное поле' }))
    } else {
      setErrors(e => { const next = { ...e }; delete next[name]; return next })
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const newErrors: Record<string, string> = {}
    if (!title.trim()) newErrors.title = 'Обязательное поле'
    if (!author.trim()) newErrors.author = 'Обязательное поле'
    if (!whyRead.trim()) newErrors.whyRead = 'Обязательное поле'
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setStatus('submitting')
    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          author: author.trim(),
          whyRead: whyRead.trim(),
          topic: topic || undefined,
          pages: pages ? Number(pages) : undefined,
          publishedDate: publishedDate.trim() || undefined,
          textUrl: textUrl.trim() || undefined,
          description: description.trim() || undefined,
          coverUrl: coverUrl.trim() || undefined,
        }),
      })
      if (!res.ok) throw new Error('Submit failed')
      setStatus('success')
    } catch {
      setStatus('error')
    }
  }

  function handleOverlay(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) handleClose()
  }

  if (!isOpen) return null

  return (
    <div
      onClick={handleOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="submit-book-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        style={{
          position: 'relative',
          background: '#fff',
          width: '100%',
          maxWidth: '480px',
          border: '2px solid #111',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          aria-label="Закрыть"
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--nd-sans), system-ui, sans-serif',
            fontSize: '1rem',
            color: '#999',
            lineHeight: 1,
            padding: '0.2rem',
          }}
        >
          ✕
        </button>

        <div style={{ padding: '2rem 2rem 1.5rem', borderBottom: '1px solid #E5E5E5' }}>
          <p style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#999', margin: '0 0 0.5rem' }}>
            Читательские круги
          </p>
          <h2 id="submit-book-title" style={{ fontFamily: 'var(--nd-serif), Georgia, serif', fontWeight: 700, fontSize: '1.4rem', color: '#111', margin: 0, letterSpacing: '-0.02em' }}>
            Предложить книгу
          </h2>
        </div>

        {status === 'success' ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '1rem', color: '#2D6A4F', fontWeight: 600, margin: '0 0 0.5rem' }}>
              Заявка принята!
            </p>
            <p style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.875rem', color: '#555', margin: 0 }}>
              Мы рассмотрим её в ближайшее время.
            </p>
            <button
              onClick={onClose}
              style={{
                marginTop: '1.5rem',
                fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#111',
                background: 'none',
                border: 'none',
                borderBottom: '1px solid #111',
                cursor: 'pointer',
                padding: '0 0 1px',
              }}
            >
              Закрыть
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
            {/* Scrollable area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '2rem 2rem 1rem' }}>
              <p style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.72rem', color: '#999', margin: '0 0 1.25rem' }}>
                * — обязательные поля
              </p>

              {/* Required fields */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <label htmlFor="sb-title" style={labelStyle}>Название *</label>
                  <input
                    id="sb-title"
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    onBlur={e => validateField('title', e.target.value)}
                    placeholder="Название книги"
                    style={errors.title ? inputErrorStyle : inputStyle}
                  />
                  {errors.title && <p style={errorTextStyle}>{errors.title}</p>}
                </div>

                <div>
                  <label htmlFor="sb-author" style={labelStyle}>Писатель *</label>
                  <input
                    id="sb-author"
                    type="text"
                    value={author}
                    onChange={e => setAuthor(e.target.value)}
                    onBlur={e => validateField('author', e.target.value)}
                    placeholder="Автор книги"
                    style={errors.author ? inputErrorStyle : inputStyle}
                  />
                  {errors.author && <p style={errorTextStyle}>{errors.author}</p>}
                </div>

                <div>
                  <label htmlFor="sb-why-read" style={labelStyle}>Почему предлагаю прочитать *</label>
                  <textarea
                    id="sb-why-read"
                    value={whyRead}
                    onChange={e => setWhyRead(e.target.value)}
                    onBlur={e => validateField('whyRead', e.target.value)}
                    placeholder="Чем вас зацепила эта книга?"
                    rows={3}
                    style={{ ...(errors.whyRead ? inputErrorStyle : inputStyle), resize: 'vertical' }}
                  />
                  {errors.whyRead && <p style={errorTextStyle}>{errors.whyRead}</p>}
                </div>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid #E5E5E5', margin: '0 0 1.25rem' }} />

              {/* Optional fields */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label htmlFor="sb-topic" style={labelStyle}>Тема</label>
                  <select
                    id="sb-topic"
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    <option value="">— выберите тему —</option>
                    {topics.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <div>
                  <label htmlFor="sb-pages" style={labelStyle}>Число страниц</label>
                  <input
                    id="sb-pages"
                    type="number"
                    inputMode="numeric"
                    value={pages}
                    onChange={e => setPages(e.target.value)}
                    placeholder="300"
                    min={1}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label htmlFor="sb-published-date" style={labelStyle}>Дата издания</label>
                  <input
                    id="sb-published-date"
                    type="text"
                    value={publishedDate}
                    onChange={e => setPublishedDate(e.target.value)}
                    placeholder="2020 или 2020-05"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label htmlFor="sb-text-url" style={labelStyle}>Ссылка на текст</label>
                  <input
                    id="sb-text-url"
                    type="url"
                    value={textUrl}
                    onChange={e => setTextUrl(e.target.value)}
                    placeholder="https://..."
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label htmlFor="sb-description" style={labelStyle}>Описание</label>
                  <textarea
                    id="sb-description"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Краткое описание книги"
                    rows={2}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </div>

                <div>
                  <label htmlFor="sb-cover-url" style={labelStyle}>Ссылка на обложку</label>
                  <input
                    id="sb-cover-url"
                    type="url"
                    value={coverUrl}
                    onChange={e => setCoverUrl(e.target.value)}
                    placeholder="https://..."
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>

            {/* Sticky submit area */}
            <div style={{ padding: '1rem 2rem', borderTop: '1px solid #E5E5E5', background: '#fff' }}>
              {status === 'error' && (
                <p style={{ ...errorTextStyle, marginBottom: '0.75rem' }}>
                  Не удалось отправить заявку. Попробуйте ещё раз.
                </p>
              )}
              <button
                type="submit"
                disabled={status === 'submitting'}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                  fontSize: '0.8rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  cursor: status === 'submitting' ? 'default' : 'pointer',
                  border: '1px solid #111',
                  background: status === 'submitting' ? 'transparent' : '#111',
                  color: status === 'submitting' ? '#999' : '#fff',
                  borderColor: status === 'submitting' ? '#C8C8C8' : '#111',
                  transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                }}
              >
                {status === 'submitting' ? 'Отправляем…' : 'Отправить заявку'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
