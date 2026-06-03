/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'

describe('0034 matching pseudonym reservations migration', () => {
  const sql = readFileSync(join(process.cwd(), 'drizzle/0034_matching_pseudonym_reservations.sql'), 'utf8')

  it('creates temporary matching pseudonym reservation fields', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "matching_pseudonym_reservations"')
    expect(sql).toContain('"session_id" text NOT NULL')
    expect(sql).toContain('"user_id" text NOT NULL')
    expect(sql).toContain('"pseudonym" text NOT NULL')
    expect(sql).toContain('"reserved_at" timestamp DEFAULT now() NOT NULL')
    expect(sql).toContain('"expires_at" timestamp NOT NULL')
  })

  it('keeps reservations unique and queryable by expiration', () => {
    expect(sql).toContain('PRIMARY KEY("session_id","user_id")')
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "matching_pseudonym_reservations_session_pseudo_idx"')
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "matching_pseudonym_reservations_expires_at_idx"')
  })
})

describe('0035 matching preference events migration', () => {
  const sql = readFileSync(join(process.cwd(), 'drizzle/0035_matching_preference_events.sql'), 'utf8')

  it('creates persistent matching preference event fields', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "matching_preference_events"')
    expect(sql).toContain('"session_id" text NOT NULL')
    expect(sql).toContain('"user_id" text NOT NULL')
    expect(sql).toContain('"actor_user_id" text NOT NULL')
    expect(sql).toContain('"event_type" text NOT NULL')
    expect(sql).toContain('"source" text NOT NULL')
    expect(sql).toContain('"book_id" text')
    expect(sql).toContain('"before" jsonb')
    expect(sql).toContain('"after" jsonb')
    expect(sql).toContain('"metadata" jsonb')
    expect(sql).toContain('"occurred_at" timestamp DEFAULT now() NOT NULL')
  })

  it('adds foreign keys and read indexes', () => {
    expect(sql).toContain('REFERENCES "public"."matching_sessions"("id")')
    expect(sql).toContain('REFERENCES "public"."user"("id")')
    expect(sql).toContain('REFERENCES "public"."books"("id")')
    expect(sql).toContain('"matching_preference_events_session_occurred_at_idx"')
    expect(sql).toContain('"matching_preference_events_user_occurred_at_idx"')
    expect(sql).toContain('"matching_preference_events_actor_occurred_at_idx"')
    expect(sql).toContain('"matching_preference_events_type_occurred_at_idx"')
    expect(sql).toContain('"matching_preference_events_book_id_idx"')
  })
})
