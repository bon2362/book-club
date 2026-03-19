# Feedback Form Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a footer with a "Написать автору проекта" button that opens a modal feedback form sending email to hello@slowreading.club via Resend.

**Architecture:** Three new files (API route, Footer component, FeedbackForm component) + one modified file (BooksPage). API route is unauthenticated, sends email synchronously. FeedbackForm pre-fills name/email for logged-in users, has a two-step email-confirmation flow, and blocks close while submitting.

**Tech Stack:** Next.js 14, Resend, React Testing Library (jsdom), Jest (node env for API tests)

---

## Chunk 1: API Route

### Task 1: `POST /api/feedback` — tests + implementation

**Files:**
- Create: `app/api/feedback/route.test.ts`
- Create: `app/api/feedback/route.ts`

- [ ] **Step 1: Write the failing tests**

Create `app/api/feedback/route.test.ts`:

```ts
/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { POST } from './route'

const mockSend = jest.fn()

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}))

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/feedback', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/feedback — validation', () => {
  it('возвращает 400 при пустом message', async () => {
    const res = await POST(makeRequest({ message: '' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Missing message')
  })

  it('возвращает 400 при отсутствии message', async () => {
    const res = await POST(makeRequest({ name: 'Иван' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Missing message')
  })

  it('возвращает 400 при message из пробелов', async () => {
    const res = await POST(makeRequest({ message: '   ' }))
    expect(res.status).toBe(400)
  })
})

describe('POST /api/feedback — happy path', () => {
  beforeEach(() => {
    mockSend.mockResolvedValue({ data: { id: 'msg-1' }, error: null })
    process.env.RESEND_API_KEY = 'test-key'
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('возвращает 200 только с message', async () => {
    const res = await POST(makeRequest({ message: 'Отличный сайт!' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
  })

  it('возвращает 200 со всеми полями', async () => {
    const res = await POST(makeRequest({ message: 'Вопрос', name: 'Иван', email: 'ivan@test.com' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
  })

  it('вызывает Resend с правильным subject (с именем)', async () => {
    await POST(makeRequest({ message: 'Привет', name: 'Иван' }))
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      subject: 'Обратная связь от Иван',
      to: 'hello@slowreading.club',
      from: 'Долгое наступление <noreply@slowreading.club>',
    }))
  })

  it('вызывает Resend с правильным subject (без имени)', async () => {
    await POST(makeRequest({ message: 'Привет' }))
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      subject: 'Обратная связь',
    }))
  })

  it('включает email и имя в тело письма', async () => {
    await POST(makeRequest({ message: 'Текст', name: 'Иван', email: 'ivan@test.com' }))
    const call = mockSend.mock.calls[0][0]
    expect(call.text).toContain('Иван')
    expect(call.text).toContain('ivan@test.com')
    expect(call.text).toContain('Текст')
  })

  it('показывает "не указано"/"не указан" когда поля пустые', async () => {
    await POST(makeRequest({ message: 'Текст' }))
    const call = mockSend.mock.calls[0][0]
    expect(call.text).toContain('не указано')
    expect(call.text).toContain('не указан')
  })
})

describe('POST /api/feedback — Resend error', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-key'
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('возвращает 500 при ошибке Resend', async () => {
    mockSend.mockRejectedValue(new Error('Resend error'))
    const res = await POST(makeRequest({ message: 'Текст' }))
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toBe('Failed to send')
  })
})
```

- [ ] **Step 2: Run tests — убедиться что падают**

```bash
npx jest app/api/feedback/route.test.ts --no-coverage 2>&1 | tail -20
```

Expected: `Cannot find module './route'`

- [ ] **Step 3: Реализовать `app/api/feedback/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { message, name, email } = body as { message?: string; name?: string; email?: string }

  if (!message?.trim()) {
    return NextResponse.json({ error: 'Missing message' }, { status: 400 })
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 })
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const subject = name?.trim()
    ? `Обратная связь от ${name.trim()}`
    : 'Обратная связь'
  const text = `Имя: ${name?.trim() || 'не указано'}\nEmail: ${email?.trim() || 'не указан'}\n\n${message.trim()}`

  try {
    await resend.emails.send({
      from: 'Долгое наступление <noreply@slowreading.club>',
      to: 'hello@slowreading.club',
      subject,
      text,
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Запустить тесты — убедиться что проходят**

```bash
npx jest app/api/feedback/route.test.ts --no-coverage 2>&1 | tail -15
```

Expected: все тесты зелёные.

- [ ] **Step 5: Lint + typecheck**

```bash
npm run lint && npm run typecheck
```

Expected: без ошибок.

- [ ] **Step 6: Commit**

```bash
git add app/api/feedback/route.ts app/api/feedback/route.test.ts
git commit -m "feat: add POST /api/feedback route with Resend email (backlog #65)"
```

---

## Chunk 2: Footer Component

### Task 2: `Footer.tsx`

**Files:**
- Create: `components/nd/Footer.tsx`

- [ ] **Step 1: Написать компонент**

```tsx
interface Props {
  onFeedback: () => void
}

export default function Footer({ onFeedback }: Props) {
  return (
    <footer
      style={{
        borderTop: '2px solid #000',
        background: '#fff',
      }}
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '0.75rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}
      >
        <button
          onClick={onFeedback}
          style={{
            fontFamily: 'var(--nd-sans), system-ui, sans-serif',
            fontSize: '0.65rem',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: '#666',
            background: 'none',
            border: 'none',
            borderBottom: '1px solid #bbb',
            cursor: 'pointer',
            padding: '0 0 1px',
          }}
        >
          Написать автору проекта
        </button>
      </div>
    </footer>
  )
}
```

- [ ] **Step 2: Lint + typecheck**

```bash
npm run lint && npm run typecheck
```

Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add components/nd/Footer.tsx
git commit -m "feat: add Footer component with feedback button (backlog #65)"
```

---

## Chunk 3: FeedbackForm Component

### Task 3: `FeedbackForm.tsx` — tests + implementation

**Files:**
- Create: `components/nd/FeedbackForm.tsx`
- Create: `components/nd/FeedbackForm.test.tsx`

- [ ] **Step 1: Написать тесты**

Создать `components/nd/FeedbackForm.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import FeedbackForm from './FeedbackForm'
import type { UserSignup } from '@/lib/signups'

const mockUser: UserSignup = {
  userId: 'user-1',
  name: 'Иван',
  contacts: '@ivan',
  email: 'ivan@test.com',
  selectedBooks: [],
}

function renderForm(overrides?: Partial<React.ComponentProps<typeof FeedbackForm>>) {
  const props = {
    isOpen: true,
    onClose: jest.fn(),
    currentUser: null,
    ...overrides,
  }
  return { ...render(<FeedbackForm {...props} />), onClose: props.onClose }
}

describe('FeedbackForm — рендер', () => {
  it('не рендерит ничего когда isOpen=false', () => {
    renderForm({ isOpen: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('рендерит dialog с правильными aria-атрибутами', () => {
    renderForm()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby', 'feedback-form-title')
  })

  it('рендерит заголовок с правильным id', () => {
    renderForm()
    const heading = screen.getByRole('heading', { name: /написать автору проекта/i })
    expect(heading).toHaveAttribute('id', 'feedback-form-title')
  })

  it('рендерит все три поля', () => {
    renderForm()
    expect(screen.getByLabelText(/сообщение/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/имя/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
  })

  it('кнопка "Отправить" изначально задизейблена (message пустой)', () => {
    renderForm()
    expect(screen.getByRole('button', { name: /отправить/i })).toBeDisabled()
  })

  it('кнопка "Отправить" активна когда message заполнен', () => {
    renderForm()
    fireEvent.change(screen.getByLabelText(/сообщение/i), { target: { value: 'Привет' } })
    expect(screen.getByRole('button', { name: /отправить/i })).not.toBeDisabled()
  })
})

describe('FeedbackForm — предзаполнение', () => {
  it('предзаполняет имя из currentUser.name', () => {
    renderForm({ currentUser: mockUser })
    expect(screen.getByLabelText(/имя/i)).toHaveValue('Иван')
  })

  it('предзаполняет email из userEmail', () => {
    renderForm({ userEmail: 'test@test.com' })
    expect(screen.getByLabelText(/email/i)).toHaveValue('test@test.com')
  })

  it('поля пустые для анонимного пользователя', () => {
    renderForm()
    expect(screen.getByLabelText(/имя/i)).toHaveValue('')
    expect(screen.getByLabelText(/email/i)).toHaveValue('')
  })
})

describe('FeedbackForm — email confirmation flow', () => {
  it('показывает предупреждение при отправке без email', () => {
    renderForm()
    fireEvent.change(screen.getByLabelText(/сообщение/i), { target: { value: 'Текст' } })
    fireEvent.click(screen.getByRole('button', { name: /^отправить$/i }))
    expect(screen.getByText(/без email/i)).toBeInTheDocument()
    expect(screen.getByText(/отправить всё равно/i)).toBeInTheDocument()
  })

  it('не отправляет при повторном клике на "Отправить" в needs-email-confirm state', async () => {
    global.fetch = jest.fn()
    renderForm()
    fireEvent.change(screen.getByLabelText(/сообщение/i), { target: { value: 'Текст' } })
    fireEvent.click(screen.getByRole('button', { name: /^отправить$/i })) // first click → show warning
    fireEvent.click(screen.getByRole('button', { name: /^отправить$/i })) // second click → still no send
    await waitFor(() => expect(global.fetch).not.toHaveBeenCalled())
  })

  it('"Отправить всё равно" отправляет форму без email', async () => {
    ;(global.fetch as jest.Mock) = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) })
    renderForm()
    fireEvent.change(screen.getByLabelText(/сообщение/i), { target: { value: 'Текст' } })
    fireEvent.click(screen.getByRole('button', { name: /^отправить$/i }))
    fireEvent.click(screen.getByRole('button', { name: /отправить всё равно/i }))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/feedback', expect.any(Object)))
  })

  it('предупреждение исчезает когда email заполняется', async () => {
    renderForm()
    fireEvent.change(screen.getByLabelText(/сообщение/i), { target: { value: 'Текст' } })
    fireEvent.click(screen.getByRole('button', { name: /^отправить$/i }))
    expect(screen.getByText(/без email/i)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@test.com' } })
    await waitFor(() => expect(screen.queryByText(/без email/i)).not.toBeInTheDocument())
  })

  it('не показывает предупреждение когда email заполнен — сразу отправляет', async () => {
    ;(global.fetch as jest.Mock) = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) })
    renderForm({ userEmail: 'user@test.com' })
    fireEvent.change(screen.getByLabelText(/сообщение/i), { target: { value: 'Текст' } })
    fireEvent.click(screen.getByRole('button', { name: /^отправить$/i }))
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(screen.queryByText(/без email/i)).not.toBeInTheDocument()
  })
})

describe('FeedbackForm — отправка', () => {
  beforeEach(() => {
    global.fetch = jest.fn()
  })

  it('показывает success state после успешной отправки', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) })
    renderForm({ userEmail: 'user@test.com' })
    fireEvent.change(screen.getByLabelText(/сообщение/i), { target: { value: 'Привет' } })
    fireEvent.click(screen.getByRole('button', { name: /^отправить$/i }))
    await waitFor(() => expect(screen.getByText(/спасибо/i)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /закрыть/i })).toBeInTheDocument()
  })

  it('показывает ошибку при неудачном запросе', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: false })
    renderForm({ userEmail: 'user@test.com' })
    fireEvent.change(screen.getByLabelText(/сообщение/i), { target: { value: 'Привет' } })
    fireEvent.click(screen.getByRole('button', { name: /^отправить$/i }))
    await waitFor(() => expect(screen.getByText(/не удалось/i)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /^отправить$/i })).toBeInTheDocument()
  })

  it('отправляет правильные данные в API', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) })
    renderForm({ currentUser: mockUser, userEmail: 'ivan@test.com' })
    fireEvent.change(screen.getByLabelText(/сообщение/i), { target: { value: 'Вопрос' } })
    fireEvent.click(screen.getByRole('button', { name: /^отправить$/i }))
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
    expect(body.message).toBe('Вопрос')
    expect(body.name).toBe('Иван')
    expect(body.email).toBe('ivan@test.com')
  })
})

describe('FeedbackForm — закрытие', () => {
  it('вызывает onClose при нажатии Escape', () => {
    const { onClose } = renderForm()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('вызывает onClose при клике на overlay', () => {
    const { onClose } = renderForm()
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalled()
  })

  it('не вызывает onClose при клике внутри модала', () => {
    const { onClose } = renderForm()
    fireEvent.click(screen.getByRole('heading', { name: /написать автору проекта/i }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('не закрывает форму при Escape во время отправки', async () => {
    ;(global.fetch as jest.Mock) = jest.fn(() => new Promise(() => {})) // never resolves
    const { onClose } = renderForm({ userEmail: 'user@test.com' })
    fireEvent.change(screen.getByLabelText(/сообщение/i), { target: { value: 'Текст' } })
    fireEvent.click(screen.getByRole('button', { name: /^отправить$/i }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('FeedbackForm — сброс при закрытии', () => {
  it('сбрасывает message и восстанавливает предзаполненные значения при закрытии', () => {
    const { rerender } = renderForm({ currentUser: mockUser, userEmail: 'ivan@test.com' })
    fireEvent.change(screen.getByLabelText(/сообщение/i), { target: { value: 'Привет' } })
    fireEvent.change(screen.getByLabelText(/имя/i), { target: { value: 'Другое имя' } })
    rerender(<FeedbackForm isOpen={false} onClose={jest.fn()} currentUser={mockUser} userEmail="ivan@test.com" />)
    rerender(<FeedbackForm isOpen={true} onClose={jest.fn()} currentUser={mockUser} userEmail="ivan@test.com" />)
    expect(screen.getByLabelText(/сообщение/i)).toHaveValue('')
    expect(screen.getByLabelText(/имя/i)).toHaveValue('Иван')
  })
})
```

- [ ] **Step 2: Запустить тесты — убедиться что падают**

```bash
npx jest components/nd/FeedbackForm.test.tsx --no-coverage 2>&1 | tail -10
```

Expected: `Cannot find module './FeedbackForm'`

- [ ] **Step 3: Реализовать `components/nd/FeedbackForm.tsx`**

```tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import type { UserSignup } from '@/lib/signups'

interface Props {
  isOpen: boolean
  onClose: () => void
  currentUser: UserSignup | null
  userEmail?: string
}

type FormState = 'idle' | 'submitting' | 'needs-email-confirm' | 'success' | 'error'

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

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#111',
  display: 'block',
  marginBottom: '0.3rem',
}

export default function FeedbackForm({ isOpen, onClose, currentUser, userEmail }: Props) {
  const initialName = currentUser?.name ?? ''
  const initialEmail = userEmail ?? ''

  const [formState, setFormState] = useState<FormState>('idle')
  const [message, setMessage] = useState('')
  const [name, setName] = useState(initialName)
  const [email, setEmail] = useState(initialEmail)

  const handleClose = useCallback(() => {
    if (formState === 'submitting') return
    onClose()
  }, [formState, onClose])

  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleClose])

  // Reset form when closed; restore pre-fill when opened
  useEffect(() => {
    if (!isOpen) {
      setFormState('idle')
      setMessage('')
      setName(currentUser?.name ?? '')
      setEmail(userEmail ?? '')
    }
  }, [isOpen, currentUser, userEmail])

  async function doSend() {
    setFormState('submitting')
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message.trim(),
          name: name.trim() || undefined,
          email: email.trim() || undefined,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      setFormState('success')
    } catch {
      setFormState('error')
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) return

    if (!email.trim()) {
      if (formState !== 'needs-email-confirm') {
        setFormState('needs-email-confirm')
        return
      }
      // second click on Отправить while in needs-email-confirm → do NOT send
      return
    }

    doSend()
  }

  function handleEmailChange(value: string) {
    setEmail(value)
    if (formState === 'needs-email-confirm') {
      setFormState('idle')
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
      aria-labelledby="feedback-form-title"
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
          <h2
            id="feedback-form-title"
            style={{ fontFamily: 'var(--nd-serif), Georgia, serif', fontWeight: 700, fontSize: '1.4rem', color: '#111', margin: 0, letterSpacing: '-0.02em' }}
          >
            Написать автору проекта
          </h2>
        </div>

        {formState === 'success' ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '1rem', color: '#2D6A4F', fontWeight: 600, margin: '0 0 0.5rem' }}>
              Спасибо!
            </p>
            <p style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.875rem', color: '#555', margin: 0 }}>
              Я прочитаю и отвечу.
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
            <div style={{ flex: 1, overflowY: 'auto', padding: '2rem 2rem 1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label htmlFor="fb-message" style={labelStyle}>Сообщение</label>
                  <textarea
                    id="fb-message"
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Вопрос, предложение или пожелание"
                    rows={4}
                    autoFocus
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </div>

                <div>
                  <label htmlFor="fb-name" style={labelStyle}>Имя</label>
                  <input
                    id="fb-name"
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Необязательно"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label htmlFor="fb-email" style={labelStyle}>Email</label>
                  <input
                    id="fb-email"
                    type="email"
                    value={email}
                    onChange={e => handleEmailChange(e.target.value)}
                    placeholder="Необязательно"
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>

            <div style={{ padding: '1rem 2rem', borderTop: '1px solid #E5E5E5', background: '#fff' }}>
              {formState === 'error' && (
                <p style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.72rem', color: '#C0603A', margin: '0 0 0.75rem' }}>
                  Не удалось отправить. Попробуйте ещё раз.
                </p>
              )}
              <button
                type="submit"
                disabled={!message.trim() || formState === 'submitting'}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                  fontSize: '0.8rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  cursor: (!message.trim() || formState === 'submitting') ? 'default' : 'pointer',
                  border: '1px solid #111',
                  background: (!message.trim() || formState === 'submitting') ? 'transparent' : '#111',
                  color: (!message.trim() || formState === 'submitting') ? '#999' : '#fff',
                  borderColor: (!message.trim() || formState === 'submitting') ? '#C8C8C8' : '#111',
                  transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                }}
              >
                {formState === 'submitting' ? 'Отправляем…' : 'Отправить'}
              </button>
              {formState === 'needs-email-confirm' && (
                <p style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.72rem', color: '#888', margin: '0.5rem 0 0', textAlign: 'center' }}>
                  Без email я не смогу ответить.{' '}
                  <button
                    type="button"
                    onClick={doSend}
                    style={{
                      fontFamily: 'inherit',
                      fontSize: 'inherit',
                      color: '#111',
                      background: 'none',
                      border: 'none',
                      borderBottom: '1px solid #111',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    Отправить всё равно
                  </button>
                </p>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Запустить тесты — убедиться что проходят**

```bash
npx jest components/nd/FeedbackForm.test.tsx --no-coverage 2>&1 | tail -20
```

Expected: все тесты зелёные.

- [ ] **Step 5: Lint + typecheck**

```bash
npm run lint && npm run typecheck
```

Expected: без ошибок.

- [ ] **Step 6: Commit**

```bash
git add components/nd/FeedbackForm.tsx components/nd/FeedbackForm.test.tsx
git commit -m "feat: add FeedbackForm modal component (backlog #65)"
```

---

## Chunk 4: Wire into BooksPage

### Task 4: Подключить Footer и FeedbackForm в BooksPage

**Files:**
- Modify: `components/nd/BooksPage.tsx`

Все изменения — в одном файле. Нужно:
1. Добавить импорты
2. Добавить state `feedbackFormOpen`
3. Вставить `<Footer>` перед `{showScrollTop && ...}`
4. Вставить `<FeedbackForm>` с остальными модалами

- [ ] **Step 1: Добавить импорты в BooksPage**

В начале файла после существующих импортов компонентов добавить:
```ts
import Footer from './Footer'
import FeedbackForm from './FeedbackForm'
```

- [ ] **Step 2: Добавить state**

После `const [submitIntent, setSubmitIntent] = useState(false)` (строка ~103) добавить:
```ts
const [feedbackFormOpen, setFeedbackFormOpen] = useState(false)
```

- [ ] **Step 3: Добавить Footer в JSX**

Перед блоком `{showScrollTop && (` (строка ~447) добавить:
```tsx
<Footer onFeedback={() => setFeedbackFormOpen(true)} />
```

- [ ] **Step 4: Добавить FeedbackForm в JSX**

После `</ProfileDrawer>` (строка ~519) и перед `</>` добавить:
```tsx
{feedbackFormOpen && (
  <FeedbackForm
    isOpen={feedbackFormOpen}
    onClose={() => setFeedbackFormOpen(false)}
    currentUser={currentUser}
    userEmail={session?.user?.email ?? undefined}
  />
)}
```

- [ ] **Step 5: Lint + typecheck**

```bash
npm run lint && npm run typecheck
```

Expected: без ошибок.

- [ ] **Step 6: Запустить все тесты**

```bash
npm test -- --no-coverage 2>&1 | tail -20
```

Expected: все тесты зелёные.

- [ ] **Step 7: Commit**

```bash
git add components/nd/BooksPage.tsx
git commit -m "feat: wire Footer and FeedbackForm into BooksPage (backlog #65)"
```

---

## После завершения

Проверить вручную в браузере:
1. Кнопка «Написать автору проекта» видна внизу страницы
2. Клик → открывается модал
3. Для залогиненного пользователя имя и email предзаполнены
4. При отправке без email → появляется предупреждение с «Отправить всё равно»
5. Успешная отправка → success state
6. Закрытие через ✕, Escape, клик на overlay работает
