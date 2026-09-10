'use client'

import { Fragment, useState } from 'react'
import {
  disclosureBlock,
  fieldInput,
  fieldLabel,
  focusRing,
  formColumn,
  formatBookTitles,
  formatShortDateTime,
  ghostButton,
  linkAction,
  microLabel,
  participantDisplayName,
  primaryButton,
  quietText,
  table,
  td,
  th,
  warnLine,
  type AllUser,
  type Participant,
} from './admin-matching-shared'

const roleTag: React.CSSProperties = { ...microLabel, fontSize: '0.66rem', letterSpacing: '0.1em' }

function ParticipantBooks({ participant }: { participant: Participant }) {
  const isReleased = Boolean(participant.completedAt)
  const wishlist = participant.wishlist ?? []
  const lines: Array<{ label: string; value: string; color?: string }> = [
    {
      label: 'Хочу читать',
      value: wishlist.length
        ? wishlist.map((book) => `${book.rank === null ? '—' : `#${book.rank}`} «${book.title}»`).join(', ')
        : 'список пуст',
    },
    ...(participant.choices.hard.length ? [{ label: 'Запись', value: formatBookTitles(participant.choices.hard) }] : []),
    ...(participant.choices.conditional.length ? [{ label: 'Авто-запись', value: formatBookTitles(participant.choices.conditional) }] : []),
    ...(participant.choices.assigned.length ? [{
      label: isReleased ? 'Читает' : 'В круге',
      value: formatBookTitles(participant.choices.assigned),
      color: 'var(--success)',
    }] : []),
    ...(participant.readingNow?.length ? [{ label: 'Читает сейчас', value: formatBookTitles(participant.readingNow) }] : []),
  ]
  return (
    <div data-testid="admin-participant-books" style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '2px 0 4px' }}>
      {lines.map((line) => (
        <div key={line.label} style={{ fontSize: '0.72rem', color: line.color ?? 'var(--text-secondary)' }}>
          {`${line.label}: ${line.value}`}
        </div>
      ))}
    </div>
  )
}

interface ParticipantsTabProps {
  participants: Participant[]
  onlinePublicRefs: Set<string>
  allUsers: AllUser[]
  loading: boolean
  canMutate: boolean
  adding: boolean
  removingUserId: string | null
  onAdd: (userId: string) => Promise<boolean>
  onRemove: (participant: Participant) => void
  onRefresh: () => void
}

export default function AdminMatchingParticipantsTab({
  participants,
  onlinePublicRefs,
  allUsers,
  loading,
  canMutate,
  adding,
  removingUserId,
  onAdd,
  onRemove,
  onRefresh,
}: ParticipantsTabProps) {
  const [expandedUserIds, setExpandedUserIds] = useState<Set<string>>(new Set())
  const [addOpen, setAddOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')

  function toggleExpanded(userId: string) {
    setExpandedUserIds((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  async function handleAdd() {
    if (!selectedUserId) return
    if (await onAdd(selectedUserId)) setSelectedUserId('')
  }

  const candidates = allUsers.filter((user) => !participants.some((participant) => participant.userId === user.id))

  return (
    <section data-testid="admin-matching-people">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
        <button type="button" onClick={onRefresh} className={focusRing} style={{ ...linkAction, fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
          обновить
        </button>
      </div>

      {loading && participants.length === 0 && <p style={quietText}>Загрузка…</p>}
      {!loading && participants.length === 0 && <p style={quietText}>Нет участников.</p>}

      {participants.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={table} data-testid="admin-matching-participants">
            <thead>
              <tr>
                <th style={th}>Имя</th>
                <th style={th}>Роль</th>
                <th style={th}>Источник</th>
                <th style={th}>Вступил</th>
                <th style={th}><span className="sr-only">Действие</span></th>
              </tr>
            </thead>
            <tbody>
              {participants.map((participant) => {
                const isReleased = Boolean(participant.completedAt)
                const isObserver = participant.role === 'observer'
                const isOnline = onlinePublicRefs.has(participant.publicRef)
                const expanded = expandedUserIds.has(participant.userId)
                const booksId = `admin-participant-books-${participant.userId}`
                return (
                  <Fragment key={participant.userId}>
                    <tr className="group hover:bg-surface-soft focus-within:bg-surface-soft" data-testid="admin-participant-row">
                      <td style={td}>
                        {isOnline && (
                          <span
                            data-testid="admin-participant-online-dot"
                            title="онлайн"
                            style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', marginRight: '0.4rem', verticalAlign: 'middle' }}
                          />
                        )}
                        <a
                          href={`/matching?as=${participant.userId}`}
                          title={participant.userId}
                          className={focusRing}
                          style={{ color: 'var(--text)', textDecoration: 'underline' }}
                        >
                          {participantDisplayName(participant)}
                        </a>
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-controls={booksId}
                          aria-label={`Книги участника ${participantDisplayName(participant)}`}
                          onClick={() => toggleExpanded(participant.userId)}
                          className={focusRing}
                          style={{ ...linkAction, fontSize: '0.68rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}
                          data-testid="admin-participant-books-toggle"
                        >
                          книги {expanded ? '▴' : '▾'}
                        </button>
                      </td>
                      <td style={td}>
                        <span
                          data-testid={isReleased ? 'admin-participant-released' : undefined}
                          title={isReleased && participant.completedAt
                            ? `Отправлен:а читать ${formatShortDateTime(participant.completedAt)}`
                            : undefined}
                          style={{
                            ...roleTag,
                            color: isReleased ? 'var(--accent)' : isObserver ? 'var(--text-muted)' : 'var(--success)',
                          }}
                        >
                          {isReleased ? 'читает' : isObserver ? 'наблюдатель' : 'активный'}
                        </span>
                      </td>
                      <td style={td}>
                        <span
                          data-testid="admin-participant-source"
                          style={{ fontSize: '0.66rem', color: participant.joinSource === 'admin' ? 'var(--accent)' : 'var(--text-muted)' }}
                        >
                          {participant.joinSource === 'admin' ? 'админ' : 'сам'}
                        </span>
                      </td>
                      <td style={{ ...td, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {formatShortDateTime(participant.joinedAt)}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {canMutate && (
                          <button
                            type="button"
                            onClick={() => onRemove(participant)}
                            disabled={removingUserId === participant.userId}
                            aria-label={`Убрать ${participantDisplayName(participant)} из сессии`}
                            className={`opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 disabled:opacity-100 ${focusRing}`}
                            style={{ ...linkAction, fontSize: '0.7rem', color: 'var(--accent)' }}
                            data-testid="admin-participant-remove"
                          >
                            {removingUserId === participant.userId ? '…' : 'убрать'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expanded && (
                      <tr id={booksId}>
                        <td colSpan={5} style={{ ...td, paddingLeft: '0.8rem' }}>
                          <ParticipantBooks participant={participant} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {canMutate && (
        <div style={disclosureBlock}>
          <button
            type="button"
            aria-expanded={addOpen}
            onClick={() => setAddOpen((value) => !value)}
            className={focusRing}
            style={{ ...linkAction, color: 'var(--text-secondary)' }}
            data-testid="admin-add-participant-toggle"
          >
            + Добавить участника вручную
          </button>
          {addOpen && (
            <div style={formColumn}>
              <p data-testid="admin-add-disclosure-warning" style={warnLine}>
                Добавление через админку обходит раскрытие реального имени участником. Используйте только в обоснованных случаях.
              </p>
              <div>
                <label htmlFor="admin-add-participant-user" style={fieldLabel}>Пользователь</label>
                <select
                  id="admin-add-participant-user"
                  value={selectedUserId}
                  onChange={(event) => setSelectedUserId(event.target.value)}
                  className={focusRing}
                  style={fieldInput}
                  data-testid="admin-add-participant-select"
                >
                  <option value="">— выбрать пользователя —</option>
                  {candidates.map((user) => (
                    <option key={user.id} value={user.id}>
                      {participantDisplayName({ userId: user.id, name: user.name })}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={!selectedUserId || adding}
                  className={`disabled:opacity-50 ${focusRing}`}
                  style={primaryButton}
                  data-testid="admin-add-participant-submit"
                >
                  {adding ? 'Добавляю…' : 'Добавить'}
                </button>
                <button type="button" onClick={() => setAddOpen(false)} className={focusRing} style={ghostButton}>
                  Отмена
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
