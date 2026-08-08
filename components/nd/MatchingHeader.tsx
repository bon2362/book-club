'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import * as Popover from '@radix-ui/react-popover'

export interface MatchingHeaderParticipant { ref: string; displayName: string; online: boolean }
export interface MatchingHeaderProps {
  sessionId: string; sessionName: string; sessionStatus: string; stateVersion: number
  deadlineAt: string | null
  viewer: { ref: string; displayName: string; role: 'active' | 'observer' }
  participants: MatchingHeaderParticipant[]; isAdmin: boolean; isImpersonating: boolean
  viewerAssigned?: boolean
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
    if (props.viewerAssigned) return
    if (!window.confirm('Покинуть сессию? Твои текущие книжные решения будут сняты.')) return
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

  const statusLabel = props.sessionStatus === 'open' ? 'открыта' : 'закрыта'
  const viewerParticipant = props.participants.find((participant) => participant.ref === props.viewer.ref)
  const menuParticipants = viewerParticipant
    ? [viewerParticipant, ...props.participants.filter((participant) => participant.ref !== props.viewer.ref)]
    : props.participants
  return <>
    {props.isImpersonating && <div data-testid="admin-impersonation-banner" style={{ padding: '0.45rem 1.3rem', borderBottom: '1px solid var(--border)', color: 'var(--status-warn)' }}>👁 Просмотр за {props.viewer.displayName}<a href="/admin?tab=matching" style={{ float: 'right', color: 'inherit' }}>← вернуться в админку</a></div>}
    <header data-testid="matching-header" className="nd-mx-hdr" style={{ padding: '0.7rem 1.3rem', borderBottom: '1px solid var(--border-strong)', background: 'var(--bg)' }}>
      <div className="nd-mx-hdr-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div className="nd-mx-hdr-l" style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
          <a href="/" aria-label="На каталог" className="nd-back-to-catalog" style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>←<span className="nd-mx-hdr-back-text"> Каталог</span></a><span className="nd-mx-hdr-div" style={{ width: 1, height: 22, background: 'var(--border)' }} />
          <h1 className="nd-mx-hdr-title" style={{ margin: 0, fontFamily: 'var(--nd-serif)', fontSize: '1.2rem', fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.1, color: 'var(--text)' }}>{props.sessionName}</h1>
          <span className="nd-mx-hdr-deadline" style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{deadlineText(props.deadlineAt, now)}</span><span className="nd-mx-hdr-status" style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.8rem', color: props.sessionStatus === 'open' ? 'var(--success)' : 'var(--text-muted)' }}>● {statusLabel}</span>
        </div>
        <div className="nd-mx-hdr-r" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {props.viewer.role === 'observer' ? <span className="nd-mx-hdr-observer" style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.8rem', color: 'var(--success)', borderBottom: '1px solid var(--success)' }}>Вы наблюдаете</span> : <span className="nd-mx-hdr-you" style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Вы — <strong style={{ color: 'var(--text)' }}>{props.viewer.displayName}</strong></span>}
          <Popover.Root open={participantsOpen} onOpenChange={setParticipantsOpen}>
            <Popover.Trigger asChild>
              <button type="button" className="nd-mx-session-menu-trigger" aria-label={`Участники и меню сессии: ${props.participants.length}`} style={{ display: 'flex', alignItems: 'center', border: 0, background: 'transparent' }}>
                <span className="nd-mx-hdr-menu-icon" aria-hidden="true"><span /><span /><span /></span>
                {props.participants.slice(0, 5).map((participant, index) => <span key={participant.ref} className="nd-mx-hdr-av" aria-label={`${participant.displayName} — ${participant.online ? 'онлайн' : 'не в сети'}`} style={{ marginLeft: index ? -8 : 0, width: 28, height: 28, borderRadius: '50%', background: 'var(--chip-bg)', boxShadow: '0 0 0 2px var(--bg)', display: 'grid', placeItems: 'center', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.66rem', fontFamily: 'var(--nd-sans)' }}>{participant.displayName[0]}</span>)}
                {props.participants.length > 5 && <span className="nd-mx-hdr-av" style={{ marginLeft: -8, width: 28, height: 28, borderRadius: '50%', background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--hair)', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: '0.6rem', fontFamily: 'var(--nd-sans)' }}>+{props.participants.length - 5}</span>}
                <span className="nd-mx-hdr-participant-count" style={{ marginLeft: 6, fontFamily: 'var(--nd-sans)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{props.participants.length}</span>
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content className="nd-mx-session-menu" role="dialog" aria-label="Участники" sideOffset={8} align="end" style={{ zIndex: 5, width: 264, padding: 0, background: 'var(--bg-input)', border: '1px solid var(--hair)', borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-pop)', overflow: 'hidden' }}>
                <div className="nd-mx-session-menu-meta">
                  <span>{deadlineText(props.deadlineAt, now)}</span>
                  <span className={`nd-mx-session-menu-status${props.sessionStatus === 'open' ? ' is-active' : ''}`}>● {statusLabel}</span>
                  {props.viewer.role === 'observer' && <span className="nd-mx-session-menu-observer">Вы наблюдаете</span>}
                </div>
                <div style={{ padding: '0.7rem 0.9rem 0.5rem' }}><span style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-muted)' }}>Участники · {props.participants.length}</span></div>
                <div className="nd-mx-session-menu-participants">
                  {menuParticipants.map((participant, index) => <div key={participant.ref} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0.9rem' }} className={`nd-matching-popover-row${index >= 6 ? ' nd-mx-session-menu-overflow-row' : ''}`}><span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: participant.online ? 'var(--status-ok)' : 'var(--text-muted)', opacity: participant.online ? 1 : 0.4 }} /><span style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.85rem', color: participant.ref === props.viewer.ref ? 'var(--text)' : 'var(--text-body)', fontWeight: participant.ref === props.viewer.ref ? 700 : 400 }}>{participant.displayName}{participant.ref === props.viewer.ref && <span className="nd-mx-session-menu-viewer"> · вы</span>}</span></div>)}
                </div>
                {props.participants.length > 6 && <div className="nd-mx-session-menu-tail">…и ещё {props.participants.length - 6}</div>}
                {!props.isAdmin && !props.isImpersonating && props.viewer.role === 'active' && <button type="button" className="nd-mx-session-menu-leave" onClick={leave} disabled={pending || props.viewerAssigned} title={props.viewerAssigned ? 'Назначенный участник не может выйти самостоятельно' : undefined}>{pending ? 'Подождите…' : 'Покинуть сессию'}</button>}
                <Popover.Close aria-label="Закрыть список участников" className="nd-matching-popover-close" style={{ display: 'block', width: '100%', textAlign: 'left', marginTop: 0, borderTop: '1px solid var(--hair-soft)', borderLeft: 0, borderRight: 0, borderBottom: 0, background: 'transparent', color: 'var(--text-secondary)', fontFamily: 'var(--nd-sans)', fontSize: '0.8rem', padding: '0.55rem 0.9rem', cursor: 'pointer', transition: 'color 0.15s ease' }}>Закрыть</Popover.Close>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          {!props.isAdmin && !props.isImpersonating && props.viewer.role === 'active' && <button type="button" className="nd-mx-hdr-leave" onClick={leave} disabled={pending || props.viewerAssigned} title={props.viewerAssigned ? 'Назначенный участник не может выйти самостоятельно' : undefined} style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.8rem', border: 0, background: 'transparent', color: 'var(--text-muted)', textDecoration: props.viewerAssigned ? 'line-through' : undefined }}>{pending ? 'Подождите…' : 'Покинуть'}</button>}
        </div>
      </div>{error && <p role="alert" style={{ margin: '0.45rem 0 0', fontFamily: 'var(--nd-sans)', fontSize: '0.8rem', color: 'var(--accent)' }}>{error}</p>}
    </header>
  </>
}
