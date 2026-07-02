'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import * as Popover from '@radix-ui/react-popover'

export interface MatchingHeaderParticipant { ref: string; displayName: string; online: boolean }
export interface MatchingHeaderProps {
  sessionId: string; sessionName: string; sessionStatus: string; stateVersion: number
  minGroupSize: number; maxGroupSize: number; deadlineAt: string | null
  viewer: { displayName: string; role: 'active' | 'observer' }
  participants: MatchingHeaderParticipant[]; isAdmin: boolean; isImpersonating: boolean
  navigate?: (url: string) => void
  onSessionRefresh?: () => void | Promise<void>
}

export function russianDayWord(days: number) {
  const lastTwo = days % 100
  if (lastTwo >= 11 && lastTwo <= 14) return 'дней'
  const last = days % 10
  if (last === 1) return 'день'
  if (last >= 2 && last <= 4) return 'дня'
  return 'дней'
}

function deadlineText(deadlineAt: string | null, now: number) {
  if (!deadlineAt) return 'Дедлайн не задан'
  const delta = new Date(deadlineAt).getTime() - now
  if (delta <= 0) return 'Дедлайн истёк'
  const days = Math.ceil(delta / 86_400_000)
  return `Дедлайн через ${days} ${russianDayWord(days)}`
}

export default function MatchingHeader(props: MatchingHeaderProps) {
  const router = useRouter()
  const [participantsOpen, setParticipantsOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [editingSize, setEditingSize] = useState(false)
  const [minSize, setMinSize] = useState(String(props.minGroupSize))
  const [maxSize, setMaxSize] = useState(String(props.maxGroupSize))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = props.navigate ?? ((url: string) => window.location.assign(url))

  useEffect(() => {
    if (!props.deadlineAt) return
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      const current = Date.now()
      const deadline = new Date(props.deadlineAt!).getTime()
      const untilMinute = 60_000 - (current % 60_000)
      const untilDeadline = deadline > current ? deadline - current + 1 : Number.POSITIVE_INFINITY
      timer = setTimeout(() => {
        setNow(Date.now())
        schedule()
      }, Math.min(untilMinute, untilDeadline))
    }
    setNow(Date.now())
    schedule()
    return () => clearTimeout(timer)
  }, [props.deadlineAt])

  async function leave() {
    if (!window.confirm('Покинуть сессию?')) return
    setPending(true); setError(null)
    try {
      const response = await fetch(`/api/matching/sessions/${props.sessionId}/leave`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedStateVersion: props.stateVersion }),
      })
      if (!response.ok) {
        if (response.status === 409) {
          if (props.onSessionRefresh) {
            await props.onSessionRefresh()
            setError('Сессия изменилась. Данные обновлены — попробуйте ещё раз.')
          } else {
            setError('Сессия изменилась. Обновите страницу и попробуйте ещё раз.')
          }
          router.refresh()
          return
        }
        const body = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'Не удалось покинуть сессию')
      }
      navigate('/matching')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось покинуть сессию')
    } finally { setPending(false) }
  }

  function cancelSize() {
    setMinSize(String(props.minGroupSize)); setMaxSize(String(props.maxGroupSize)); setError(null); setEditingSize(false)
  }

  async function saveSize() {
    const minGroupSize = Number(minSize); const maxGroupSize = Number(maxSize)
    if (!Number.isInteger(minGroupSize) || !Number.isInteger(maxGroupSize) || minGroupSize < 2 || maxGroupSize < minGroupSize) {
      setError('Размеры должны быть целыми: минимум 2, максимум не меньше минимума')
      return
    }
    setPending(true); setError(null)
    try {
      const response = await fetch(`/api/matching/sessions/${props.sessionId}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ minGroupSize, maxGroupSize }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'Не удалось изменить размер групп')
      }
      setEditingSize(false)
      await props.onSessionRefresh?.()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось изменить размер групп')
    } finally { setPending(false) }
  }

  const groups = props.minGroupSize === props.maxGroupSize ? `Группы по ${props.minGroupSize}` : `Группы ${props.minGroupSize}–${props.maxGroupSize}`
  return <>
    {props.isImpersonating && <div data-testid="admin-impersonation-banner" style={{ padding: '0.45rem 1.3rem', borderBottom: '1px solid var(--border)', color: 'var(--status-warn)' }}>👁 Просмотр за {props.viewer.displayName}<a href="/admin?tab=matching" style={{ float: 'right', color: 'inherit' }}>← вернуться в админку</a></div>}
    <header data-testid="matching-header" style={{ padding: '0.7rem 1.3rem', borderBottom: '1px solid var(--border-strong)', background: 'var(--bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
          <a href="/" aria-label="На каталог" className="nd-back-to-catalog" style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>← Каталог</a><span style={{ width: 1, height: 22, background: 'var(--border)' }} />
          <h1 style={{ margin: 0, fontFamily: 'var(--nd-serif)', fontSize: '1.2rem', fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.1, color: 'var(--text)' }}>{props.sessionName}</h1>
          {editingSize ? <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <label style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Мин. <input className="nd-inline-number" aria-label="Минимум участников" type="number" value={minSize} onChange={(e) => setMinSize(e.target.value)} style={{ width: 46, border: '1px solid var(--border)', background: 'var(--bg-input)' }} /></label>
            <label style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Макс. <input className="nd-inline-number" aria-label="Максимум участников" type="number" value={maxSize} onChange={(e) => setMaxSize(e.target.value)} style={{ width: 46, border: '1px solid var(--border)', background: 'var(--bg-input)' }} /></label>
            <button type="button" onClick={saveSize} disabled={pending} style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.8rem', border: '1px solid var(--text)', background: 'var(--text)', color: 'var(--bg-input)' }}>Сохранить</button>
            <button type="button" onClick={cancelSize} disabled={pending} style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.8rem', border: 0, background: 'transparent', color: 'var(--text-muted)' }}>Отмена</button>
          </div> : <span style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{groups} {props.isAdmin && props.sessionStatus === 'active' && <button type="button" aria-label="Изменить размер групп" onClick={() => setEditingSize(true)} style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.8rem', border: 0, background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>✎</button>}</span>}
          <span style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{deadlineText(props.deadlineAt, now)}</span><span style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.8rem', color: props.sessionStatus === 'active' ? 'var(--success)' : 'var(--text-muted)' }}>● {props.sessionStatus === 'active' ? 'активна' : 'заморожена'}</span>
        </div>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {props.viewer.role === 'observer' ? <span style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.8rem', color: 'var(--success)', borderBottom: '1px solid var(--success)' }}>Вы наблюдаете</span> : <span style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Вы — <strong style={{ color: 'var(--text)' }}>{props.viewer.displayName}</strong></span>}
          <Popover.Root open={participantsOpen} onOpenChange={setParticipantsOpen}>
            <Popover.Trigger asChild>
              <button type="button" aria-label={`Участники: ${props.participants.length}`} style={{ display: 'flex', alignItems: 'center', border: 0, background: 'transparent' }}>{props.participants.slice(0, 5).map((participant, index) => <span key={participant.ref} aria-label={`${participant.displayName} — ${participant.online ? 'онлайн' : 'не в сети'}`} style={{ marginLeft: index ? -8 : 0, width: 28, height: 28, borderRadius: '50%', background: 'var(--chip-bg)', boxShadow: '0 0 0 2px var(--bg)', display: 'grid', placeItems: 'center', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.66rem', fontFamily: 'var(--nd-sans)' }}>{participant.displayName[0]}</span>)}{props.participants.length > 5 && <span style={{ marginLeft: -8, width: 28, height: 28, borderRadius: '50%', background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--hair)', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: '0.6rem', fontFamily: 'var(--nd-sans)' }}>+{props.participants.length - 5}</span>}<span style={{ marginLeft: 6, fontFamily: 'var(--nd-sans)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{props.participants.length}</span></button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content role="dialog" aria-label="Участники" sideOffset={8} align="end" style={{ zIndex: 5, width: 264, padding: 0, background: 'var(--bg-input)', border: '1px solid var(--hair)', borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-pop)', overflow: 'hidden' }}>
                <div style={{ padding: '0.7rem 0.9rem 0.5rem' }}><span style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-muted)' }}>Участники · {props.participants.length}</span></div>
                {props.participants.map((participant) => <div key={participant.ref} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0.9rem' }} className="nd-matching-popover-row"><span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: participant.online ? 'var(--status-ok)' : 'var(--text-muted)', opacity: participant.online ? 1 : 0.4 }} /><span style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.85rem', color: participant.displayName === props.viewer.displayName ? 'var(--text)' : 'var(--text-body)', fontWeight: participant.displayName === props.viewer.displayName ? 700 : 400 }}>{participant.displayName}</span></div>)}
                <Popover.Close aria-label="Закрыть список участников" className="nd-matching-popover-close" style={{ display: 'block', width: '100%', textAlign: 'left', marginTop: 0, borderTop: '1px solid var(--hair-soft)', borderLeft: 0, borderRight: 0, borderBottom: 0, background: 'transparent', color: 'var(--text-secondary)', fontFamily: 'var(--nd-sans)', fontSize: '0.8rem', padding: '0.55rem 0.9rem', cursor: 'pointer', transition: 'color 0.15s ease' }}>Закрыть</Popover.Close>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          {!props.isImpersonating && props.viewer.role === 'active' && <button type="button" onClick={leave} disabled={pending} style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.8rem', border: 0, background: 'transparent', color: 'var(--text-muted)' }}>{pending ? 'Подождите…' : 'Покинуть'}</button>}
        </div>
      </div>{error && <p role="alert" style={{ margin: '0.45rem 0 0', fontFamily: 'var(--nd-sans)', fontSize: '0.8rem', color: 'var(--accent)' }}>{error}</p>}
    </header>
  </>
}
