'use client'

import { useState } from 'react'
import type { MatchingBookAdminParticipant, MatchingBookParticipantView, MatchingBookView } from './matching-book-types'

export type MatchingBookAdminAction =
  | 'assign'
  | 'unassign'
  | 'removeParticipant'
  | 'createCircle'
  | 'deleteCircle'
  | 'place'
  | 'releaseCircle'
  | 'returnCircle'

export interface MatchingBookAdminCommand {
  action: MatchingBookAdminAction
  participant?: MatchingBookParticipantView
  circleId?: string
}

export default function MatchingBookAdminControls({
  book,
  adminParticipants,
  pending,
  onAction,
}: {
  book: MatchingBookView
  adminParticipants: MatchingBookAdminParticipant[]
  pending: boolean
  onAction: (command: MatchingBookAdminCommand) => void
}) {
  const [open, setOpen] = useState(false)
  const [selectedParticipantId, setSelectedParticipantId] = useState('')
  const assignedRefs = new Set(book.circles.flatMap((circle) => circle.memberRefs).concat(book.unplacedParticipantRefs))

  return (
    <section className="nd-mb-admin" aria-label={`Управление книгой «${book.title}»`} data-testid={`matching-book-admin-${book.bookId}`}>
      <button type="button" className="nd-mb-admin-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {open ? 'Скрыть управление' : 'Управлять составом'}
      </button>
      {open && (
        <div className="nd-mb-admin-body">
          <div className="nd-mb-admin-circles">
            <button type="button" disabled={pending} onClick={() => onAction({ action: 'createCircle' })}>+ Создать круг</button>
            {book.circles.map((circle, index) => (
              <span key={circle.id}>
                {circle.memberRefs.length > 0 && circle.memberRefs.every(ref => adminParticipants.find(item => item.ref === ref)?.completed) ? (
                  <button type="button" disabled={pending} onClick={() => onAction({ action: 'returnCircle', circleId: circle.id })}>Вернуть в подбор</button>
                ) : (
                  <button type="button" disabled={pending} onClick={() => {
                    const names = circle.memberRefs.map(ref => adminParticipants.find(item => item.ref === ref)?.displayName ?? ref).join(', ')
                    if (window.confirm(`Отправить читать: ${names}?`)) onAction({ action: 'releaseCircle', circleId: circle.id })
                  }}>Отправить читать</button>
                )}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm(`Удалить круг ${index + 1}? Участники останутся назначенными без круга.`)) {
                      onAction({ action: 'deleteCircle', circleId: circle.id })
                    }
                  }}
                >
                  Удалить круг {index + 1}
                </button>
              </span>
            ))}
          </div>
          <div className="nd-mb-admin-add">
            <label>
              Записать участника
              <select value={selectedParticipantId} onChange={(event) => setSelectedParticipantId(event.target.value)} disabled={pending}>
                <option value="">Выберите…</option>
                {adminParticipants
                  .filter((participant) => !participant.assignmentBookIds.includes(book.bookId))
                  .map((participant) => (
                    <option key={participant.adminUserId} value={participant.adminUserId}>
                      {participant.displayName}
                    </option>
                  ))}
              </select>
            </label>
            <button
              type="button"
              disabled={pending || !selectedParticipantId}
              onClick={() => {
                const participant = adminParticipants.find((item) => item.adminUserId === selectedParticipantId)
                if (!participant) return
                onAction({ action: 'assign', participant: {
                  ref: participant.ref,
                  displayName: participant.displayName,
                  adminUserId: participant.adminUserId,
                  status: 'interest',
                  rank: null,
                } })
                setSelectedParticipantId('')
              }}
            >
              Записать сюда
            </button>
            <button
              type="button"
              disabled={pending || !selectedParticipantId}
              onClick={() => {
                const participant = adminParticipants.find((item) => item.adminUserId === selectedParticipantId)
                if (!participant || !window.confirm(`Исключить ${participant.displayName} из этой сессии?`)) return
                onAction({ action: 'removeParticipant', participant: {
                  ref: participant.ref,
                  displayName: participant.displayName,
                  adminUserId: participant.adminUserId,
                  status: 'interest',
                  rank: null,
                } })
                setSelectedParticipantId('')
              }}
            >
              Исключить из сессии
            </button>
          </div>
          <ul>
            {book.participants.map((participant) => {
              const assigned = participant.status === 'assigned' || assignedRefs.has(participant.ref)
              const currentCircle = book.circles.find((circle) => circle.memberRefs.includes(participant.ref))?.id ?? ''
              return (
                <li key={participant.ref}>
                  <span className="nd-mb-admin-name">
                    {participant.completed ? `${participant.displayName} · читает` : participant.displayName}
                  </span>
                  <div className="nd-mb-admin-actions">
                    {assigned ? (
                      <>
                        <select
                          aria-label={`Круг для ${participant.displayName}`}
                          value={currentCircle}
                          disabled={pending}
                          onChange={(event) => onAction(event.target.value
                            ? { action: 'place', participant, circleId: event.target.value }
                            : { action: 'place', participant })}
                        >
                          <option value="">Без круга</option>
                          {book.circles.map((circle, index) => <option key={circle.id} value={circle.id}>Круг {index + 1}</option>)}
                        </select>
                        <button type="button" disabled={pending} onClick={() => onAction({ action: 'unassign', participant })}>Снять</button>
                      </>
                    ) : (
                      <button type="button" disabled={pending} onClick={() => onAction({ action: 'assign', participant })}>Назначить</button>
                    )}
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        if (window.confirm(`Исключить ${participant.displayName} из этой сессии?`)) onAction({ action: 'removeParticipant', participant })
                      }}
                    >
                      Исключить
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}
