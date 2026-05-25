// Test-only endpoint: removes E2E users that may be left behind by failed tests.
// Only works when NEXTAUTH_TEST_MODE=true — never enabled in production.

import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { isTestEndpointAllowed } from '@/lib/test-mode'

function notAllowed() {
  return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
}

export async function DELETE() {
  if (!isTestEndpointAllowed()) return notAllowed()

  const result = await db.execute(sql`
    WITH target_users AS (
      SELECT u."id", u."contact_email"
      FROM "user" u
      WHERE u."contact_email" ILIKE '%@test.invalid'
        OR u."name" ILIKE 'E2E %'

      UNION

      SELECT ui."user_id" AS "id", u."contact_email"
      FROM "user_identities" ui
      JOIN "user" u ON u."id" = ui."user_id"
      WHERE ui."email" ILIKE '%@test.invalid'
        OR ui."provider_account_id" ILIKE '%@test.invalid'
    ),
    target_emails AS (
      SELECT "contact_email" AS "email"
      FROM target_users
      WHERE "contact_email" IS NOT NULL
    ),
    deleted_feedback AS (
      DELETE FROM "feedback"
      WHERE "user_id" IN (SELECT "id" FROM target_users)
        OR "email" ILIKE '%@test.invalid'
        OR "message" ILIKE 'E2E %'
      RETURNING "id"
    ),
    deleted_notifications AS (
      DELETE FROM "notification_queue"
      WHERE "user_email" IN (SELECT "email" FROM target_emails)
        OR "user_email" ILIKE '%@test.invalid'
      RETURNING "id"
    ),
    deleted_identities AS (
      DELETE FROM "user_identities"
      WHERE "user_id" IN (SELECT "id" FROM target_users)
      RETURNING "id"
    ),
    deleted_users AS (
      DELETE FROM "user"
      WHERE "id" IN (SELECT "id" FROM target_users)
      RETURNING "id"
    )
    SELECT
      (SELECT count(*)::int FROM deleted_users) AS "users",
      (SELECT count(*)::int FROM deleted_identities) AS "identities",
      (SELECT count(*)::int FROM deleted_feedback) AS "feedback",
      (SELECT count(*)::int FROM deleted_notifications) AS "notifications"
  `)

  const [deleted] = result as unknown as Array<{
    users: number
    identities: number
    feedback: number
    notifications: number
  }>

  return NextResponse.json({ ok: true, deleted: deleted ?? null })
}
