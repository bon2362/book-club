import { reportMatchingEvents } from '@/lib/matching-analytics'
import { captureServerEvent } from '@/lib/posthog-server'

jest.mock('@/lib/posthog-server', () => ({
  captureServerEvent: jest.fn().mockResolvedValue(undefined),
}))

const captureMock = captureServerEvent as jest.MockedFunction<typeof captureServerEvent>
const participant = { userId: 'user-1', label: 'Иван', source: 'user' }
const admin = { userId: 'admin-1', label: 'Админ', source: 'admin' }

describe('reportMatchingEvents', () => {
  beforeEach(() => captureMock.mockClear())

  it('ничего не отправляет, если событий нет', async () => {
    await reportMatchingEvents('s1', participant, [])
    expect(captureMock).not.toHaveBeenCalled()
  })

  it('действие участника уходит в его профиль с типом, книгой и сессией', async () => {
    await reportMatchingEvents('s1', participant, [
      { eventType: 'set_hard', stateVersion: 7, actorUserId: 'user-1', subjectUserId: 'user-1', bookId: 'book-9' },
    ])
    expect(captureMock).toHaveBeenCalledWith('user-1', 'matching_set_hard', {
      matching_event_type: 'set_hard',
      session_id: 's1',
      book_id: 'book-9',
      source: 'user',
      performed_by: 'self',
      state_version: 7,
    })
  })

  it('действие администратора над участником попадает в профиль участника с пометкой other', async () => {
    await reportMatchingEvents('s1', admin, [
      { eventType: 'participant_directly_assigned', stateVersion: 3, actorUserId: 'admin-1', subjectUserId: 'user-2', bookId: 'book-1' },
    ])
    expect(captureMock).toHaveBeenCalledWith('user-2', 'matching_participant_directly_assigned', expect.objectContaining({
      performed_by: 'other',
      source: 'admin',
    }))
  })

  it('событие без человека отправляется от имени сессии и не создаёт профиль', async () => {
    await reportMatchingEvents('s1', { userId: null, label: null, source: 'system' }, [
      { eventType: 'book_formed', stateVersion: 4, bookId: 'book-1' },
    ])
    expect(captureMock).toHaveBeenCalledWith('matching-session:s1', 'matching_book_formed', expect.objectContaining({
      performed_by: 'system',
      $process_person_profile: false,
    }))
  })

  // Защита приватности: снимки имён и списки книг в PostHog не уходят.
  it('не отправляет before, after и metadata', async () => {
    await reportMatchingEvents('s1', participant, [
      {
        eventType: 'welcome_name_changed',
        stateVersion: 1,
        actorUserId: 'user-1',
        subjectUserId: 'user-1',
        before: { name: 'Старое имя' },
        after: { name: 'Новое имя', bookIds: ['book-1'] },
        metadata: { names: ['Иван Петров'] },
      },
    ])
    const [, , properties] = captureMock.mock.calls[0]
    expect(Object.keys(properties ?? {})).not.toEqual(expect.arrayContaining(['before']))
    expect(JSON.stringify(properties)).not.toContain('Иван Петров')
    expect(JSON.stringify(properties)).not.toContain('Новое имя')
  })

  it('сбой отправки не пробрасывается наружу', async () => {
    captureMock.mockRejectedValueOnce(new Error('posthog down'))
    await expect(reportMatchingEvents('s1', participant, [
      { eventType: 'leave', stateVersion: 2, actorUserId: 'user-1', subjectUserId: 'user-1' },
    ])).resolves.toBeUndefined()
  })
})
