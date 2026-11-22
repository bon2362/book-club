import { NextRequest, NextResponse } from 'next/server'
import { resolveTelegramCalendarActor, TelegramCalendarActorError } from '@/lib/calendar/calendar-actor'
import { CalendarStateError, isMissingCalendarSchemaError } from '@/lib/calendar/public-state'
import {
  getTelegramTopicBinding,
  loadTelegramTopicStateForMember,
  publishTelegramTopicAnnouncement,
  TelegramTopicError,
} from '@/lib/calendar/telegram-topic-calendar'

export const dynamic = 'force-dynamic'

type Params = { params: { bindingId: string } }

/** Подписанный initData + привязанный Telegram + участие именно в этом круге. */
async function authorize(req: NextRequest, bindingId: string) {
  const actor = await resolveTelegramCalendarActor(req)
  const binding = await getTelegramTopicBinding(bindingId)
  if (!binding) throw new TelegramTopicError('binding_not_found')
  await loadTelegramTopicStateForMember(binding, actor)
  return { actor, binding }
}

function errorResponse(error: unknown) {
  if (error instanceof TelegramCalendarActorError) return NextResponse.json({ error: error.code }, { status: error.code === 'telegram_identity_not_linked' ? 403 : 401 })
  if (error instanceof TelegramTopicError) {
    if (error.code === 'binding_not_found') return NextResponse.json({ error: error.code }, { status: 404 })
    return NextResponse.json({ error: error.code }, { status: 403 })
  }
  if (error instanceof CalendarStateError) return NextResponse.json({ error: error.code }, { status: 404 })
  if (isMissingCalendarSchemaError(error)) return NextResponse.json({ error: 'migration_required' }, { status: 409 })
  return NextResponse.json({ error: 'topic_calendar_failed' }, { status: 500 })
}

/** Direct Link из темы → slug календаря. Наружу уходит только slug. */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { binding } = await authorize(req, params.bindingId)
    return NextResponse.json({ slug: binding.slug })
  } catch (error) {
    return errorResponse(error)
  }
}

/** После сохранения в Mini App — обновить (или переотправить) сообщение темы. */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { actor, binding } = await authorize(req, params.bindingId)
    const outcome = await publishTelegramTopicAnnouncement(binding, actor)
    return NextResponse.json({ ok: outcome !== 'failed' })
  } catch (error) {
    return errorResponse(error)
  }
}
