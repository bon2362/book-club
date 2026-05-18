import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const MONTHLY_LIMIT = 1_000_000

export async function GET() {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY
  const projectId = process.env.POSTHOG_PROJECT_ID
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.posthog.com'

  if (!apiKey || !projectId) {
    return NextResponse.json(
      { error: 'not_configured', message: 'POSTHOG_PERSONAL_API_KEY or POSTHOG_PROJECT_ID is missing' },
      { status: 503 },
    )
  }

  try {
    const res = await fetch(`${host}/api/projects/${projectId}/query/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: {
          kind: 'HogQLQuery',
          query: 'SELECT count() FROM events WHERE timestamp >= toStartOfMonth(now())',
        },
      }),
      cache: 'no-store',
    })

    if (!res.ok) {
      const body = await res.text()
      return NextResponse.json(
        { error: 'posthog_error', status: res.status, body: body.slice(0, 500) },
        { status: 502 },
      )
    }

    const data = await res.json()
    const count = Number(data?.results?.[0]?.[0] ?? 0)

    return NextResponse.json({
      eventsThisMonth: count,
      limit: MONTHLY_LIMIT,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'fetch_failed', message: err instanceof Error ? err.message : 'unknown' },
      { status: 502 },
    )
  }
}
