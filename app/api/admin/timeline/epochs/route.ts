export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { asc } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { historicalEpochs } from '@/lib/db/schema'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import {
  TimelineValidationError,
  assertEpochDates,
  epochInputSchema,
  epochValues,
  firstZodMessage,
} from '@/lib/timeline/admin'

export async function GET() {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rows = await db
    .select({
      id: historicalEpochs.id,
      title: historicalEpochs.title,
      startYear: historicalEpochs.startYear,
      startEra: historicalEpochs.startEra,
      startMonth: historicalEpochs.startMonth,
      startDay: historicalEpochs.startDay,
      endYear: historicalEpochs.endYear,
      endEra: historicalEpochs.endEra,
      endMonth: historicalEpochs.endMonth,
      endDay: historicalEpochs.endDay,
      description: historicalEpochs.description,
      imageUrl: historicalEpochs.imageUrl,
      imageCaption: historicalEpochs.imageCaption,
    })
    .from(historicalEpochs)
    .orderBy(asc(historicalEpochs.title))

  return NextResponse.json({ success: true, data: rows })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректное тело запроса' }, { status: 400 })
  }

  const parsed = epochInputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: firstZodMessage(parsed.error) }, { status: 400 })
  }

  try {
    assertEpochDates(parsed.data)
  } catch (err) {
    if (err instanceof TimelineValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    throw err
  }

  const id = crypto.randomUUID()
  await withAuditContext(
    {
      actorUserId: session.user.id,
      actorLabel: session.user.name ?? session.user.contactEmail ?? null,
      source: 'admin',
      reason: 'Создание эпохи ленты времени',
    },
    async (tx) => tx.insert(historicalEpochs).values({ id, ...epochValues(parsed.data) }),
  )

  return NextResponse.json({ success: true, data: { id, ...epochValues(parsed.data) } })
}
