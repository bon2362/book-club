'use client'

import { Fragment, useState } from 'react'
import {
  disclosureBlock,
  fieldInput,
  fieldLabel,
  focusRing,
  formColumn,
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

/** Плотность строк: строка стала кликабельной зоной, ей нужна высота. */
const peopleTd: React.CSSProperties = { ...td, padding: '8px 10px 8px 0' }

interface BookGroupData {
  key: string
  label: string
  tone: string
  items: Array<{ title: string; rank: number | null }>
}

function plainBooks(titles: string[]): Array<{ title: string; rank: number | null }> {
  return titles.map((title) => ({ title, rank: null }))
}

/** Шесть групп книг участника. Пустые не рендерятся. */
export function participantBookGroups(participant: Participant): BookGroupData[] {
  const isReleased = Boolean(participant.completedAt)
  const wishlist = participant.wishlist ?? []
  const ranked = wishlist
    .filter((book) => book.rank !== null)
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
  const unranked = wishlist.filter((book) => book.rank === null)
  const groups: BookGroupData[] = [
    { key: 'want', label: 'Хочу читать', tone: 'var(--text-body)', items: ranked },
    { key: 'unranked', label: 'Без приоритета', tone: 'var(--text-body)', items: unranked },
    { key: 'hard', label: 'Записался:ась', tone: 'var(--text)', items: plainBooks(participant.choices.hard) },
    { key: 'conditional', label: 'Авто-запись', tone: 'var(--accent)', items: plainBooks(participant.choices.conditional) },
    {
      key: 'assigned',
      label: isReleased ? 'Читает' : 'В круге',
      tone: 'var(--success)',
      items: plainBooks(participant.choices.assigned),
    },
    { key: 'reading', label: 'Читает сейчас', tone: 'var(--success)', items: plainBooks(participant.readingNow ?? []) },
  ]
  return groups.filter((group) => group.items.length > 0)
}

function ParticipantBooks({ groups }: { groups: BookGroupData[] }) {
  return (
    <div
      data-testid="admin-participant-books"
      style={{
        display: 'flex',
        flexDirection: 'column',
        marginLeft: '1.25rem',
        paddingLeft: '1.1rem',
        borderLeft: '2px solid var(--hair)',
      }}
    >
      {groups.map((group, index) => (
        <div
          key={group.key}
          data-testid="admin-participant-book-group"
          data-group={group.key}
          style={{
            display: 'grid',
            gridTemplateColumns: '8.5rem minmax(0, 1fr)',
            gap: '0 1.2rem',
            padding: '9px 0',
            borderTop: index === 0 ? undefined : '1px solid var(--hair)',
          }}
        >
          <div style={{ ...microLabel, fontSize: '0.58rem', color: group.tone, paddingTop: '0.18rem' }}>
            {group.label}
          </div>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {group.items.map((book) => (
              <li
                key={`${group.key}:${book.title}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.7rem minmax(0, 1fr)',
                  gap: '0.4rem',
                  alignItems: 'baseline',
                  fontSize: '0.8rem',
                  lineHeight: 1.35,
                }}
              >
                <span style={{ fontFamily: 'var(--nd-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                  {book.rank === null ? '·' : `#${book.rank}`}
                </span>
                <span style={{ color: group.tone === 'var(--text-body)' ? 'var(--text-body)' : 'var(--text)' }}>
                  {book.title}
                </span>
              </li>
            ))}
          </ol>
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
                const groups = participantBookGroups(participant)
                const hasBooks = groups.length > 0
                const displayName = participantDisplayName(participant)
                return (
                  <Fragment key={participant.userId}>
                    <tr
                      className={`group ${hasBooks ? 'cursor-pointer hover:bg-surface-soft focus-within:bg-surface-soft' : 'focus-within:bg-surface-soft'} ${focusRing}`}
                      data-testid="admin-participant-row"
                      data-expanded={expanded ? 'true' : undefined}
                      role={hasBooks ? 'button' : undefined}
                      tabIndex={hasBooks ? 0 : undefined}
                      aria-expanded={hasBooks ? expanded : undefined}
                      aria-controls={hasBooks ? booksId : undefined}
                      aria-label={hasBooks ? `Книги участника ${displayName}` : undefined}
                      onClick={hasBooks ? () => toggleExpanded(participant.userId) : undefined}
                      onKeyDown={hasBooks
                        ? (event) => {
                            if (event.target !== event.currentTarget) return
                            if (event.key !== 'Enter' && event.key !== ' ') return
                            event.preventDefault()
                            toggleExpanded(participant.userId)
                          }
                        : undefined}
                      style={expanded ? { background: 'var(--surface-soft)' } : undefined}
                    >
                      <td style={expanded ? { ...peopleTd, borderBottomColor: 'transparent' } : peopleTd}>
                        <span
                          aria-hidden="true"
                          data-testid="admin-participant-books-toggle"
                          style={{
                            display: 'inline-block',
                            width: '1.1rem',
                            marginRight: '0.15rem',
                            fontSize: '0.6rem',
                            lineHeight: 1,
                            color: expanded ? 'var(--text)' : 'var(--text-muted)',
                            visibility: hasBooks ? 'visible' : 'hidden',
                          }}
                        >
                          {expanded ? '▾' : '▸'}
                        </span>
                        <span
                          data-testid="admin-participant-nameslot"
                          style={{ cursor: 'default' }}
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
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
                            {displayName}
                          </a>
                        </span>
                      </td>
                      <td style={expanded ? { ...peopleTd, borderBottomColor: 'transparent' } : peopleTd}>
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
                      <td style={expanded ? { ...peopleTd, borderBottomColor: 'transparent' } : peopleTd}>
                        <span
                          data-testid="admin-participant-source"
                          style={{ fontSize: '0.66rem', color: participant.joinSource === 'admin' ? 'var(--accent)' : 'var(--text-muted)' }}
                        >
                          {participant.joinSource === 'admin' ? 'админ' : 'сам'}
                        </span>
                      </td>
                      <td style={{ ...peopleTd, color: 'var(--text-muted)', whiteSpace: 'nowrap', ...(expanded ? { borderBottomColor: 'transparent' } : {}) }}>
                        {formatShortDateTime(participant.joinedAt)}
                      </td>
                      <td style={{ ...peopleTd, textAlign: 'right', ...(expanded ? { borderBottomColor: 'transparent' } : {}) }}>
                        {canMutate && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              onRemove(participant)
                            }}
                            disabled={removingUserId === participant.userId}
                            aria-label={`Убрать ${displayName} из сессии`}
                            className={`opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 disabled:opacity-100 ${focusRing}`}
                            style={{ ...linkAction, fontSize: '0.7rem', color: 'var(--accent)' }}
                            data-testid="admin-participant-remove"
                          >
                            {removingUserId === participant.userId ? '…' : 'убрать'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expanded && hasBooks && (
                      <tr id={booksId}>
                        <td
                          colSpan={5}
                          style={{
                            padding: '2px 0 16px',
                            background: 'var(--surface-soft)',
                            borderBottom: '1px solid var(--border-strong)',
                          }}
                        >
                          <ParticipantBooks groups={groups} />
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
