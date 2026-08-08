import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import { test, expect } from '../../fixtures'

const migrationSql = readFileSync(
  join(process.cwd(), 'drizzle/0059_remove_matching_scenarios.sql'),
  'utf8',
)

function schemaName() {
  return `e2e_matching_migration_${randomUUID().replaceAll('-', '')}`
}

function inSchema(schema: string, sql: string) {
  return `BEGIN;\nSET LOCAL search_path TO "${schema}";\n${sql}\nCOMMIT;`
}

async function runMigration(
  dbExec: (sql: string) => Promise<Record<string, unknown>[]>,
  schema: string,
) {
  try {
    await dbExec(inSchema(schema, migrationSql))
  } catch (error) {
    await dbExec('ROLLBACK')
    throw error
  }
}

const fixtureSchemaSql = `
  CREATE TABLE matching_sessions (
    id text PRIMARY KEY,
    name text NOT NULL DEFAULT 'fixture',
    created_at timestamp NOT NULL DEFAULT now(),
    status text NOT NULL,
    state_version integer NOT NULL DEFAULT 0,
    frozen_at timestamp,
    frozen_scenario_json jsonb,
    book_mode_initialized_at timestamp,
    CONSTRAINT matching_sessions_status_check CHECK (status IN ('active', 'frozen', 'open', 'closed')),
    CONSTRAINT matching_sessions_book_mode_lifecycle_check
      CHECK (book_mode_initialized_at IS NULL OR status IN ('open', 'closed'))
  );
  CREATE UNIQUE INDEX matching_sessions_single_active_idx ON matching_sessions ((true))
    WHERE status IN ('active', 'open');
  CREATE TABLE matching_session_participants (
    session_id text NOT NULL,
    user_id text NOT NULL,
    PRIMARY KEY (session_id, user_id)
  );
  CREATE TABLE signup_books (
    user_id text NOT NULL,
    book_id text NOT NULL,
    signed_at timestamp NOT NULL DEFAULT now(),
    personal_status text,
    personal_status_updated_at timestamptz,
    PRIMARY KEY (user_id, book_id)
  );
  CREATE TABLE book_priorities (
    user_id text NOT NULL,
    book_id text NOT NULL,
    rank integer NOT NULL,
    rank_source text NOT NULL DEFAULT 'auto',
    updated_at timestamp NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, book_id)
  );
  CREATE TABLE matching_book_intents (
    session_id text NOT NULL,
    user_id text NOT NULL,
    book_id text NOT NULL,
    kind text NOT NULL
  );
  CREATE TABLE matching_session_book_states (
    session_id text NOT NULL,
    book_id text NOT NULL,
    formed_at timestamp NOT NULL DEFAULT now(),
    formed_state_version integer NOT NULL,
    PRIMARY KEY (session_id, book_id)
  );
  CREATE TABLE matching_locked_circles (
    id text PRIMARY KEY,
    session_id text NOT NULL,
    book_id text NOT NULL,
    circle_key text NOT NULL,
    status text NOT NULL DEFAULT 'locked',
    locked_at timestamp NOT NULL DEFAULT now(),
    locked_state_version integer NOT NULL DEFAULT 0
  );
  CREATE TABLE matching_locked_circle_members (
    circle_id text NOT NULL,
    session_id text NOT NULL,
    user_id text NOT NULL,
    display_name_snapshot text NOT NULL,
    released_at timestamp,
    PRIMARY KEY (circle_id, user_id)
  );
  CREATE TABLE matching_circle_confirmations (session_id text, user_id text);
  CREATE TABLE matching_circles (
    id text PRIMARY KEY,
    session_id text NOT NULL,
    book_id text NOT NULL,
    position integer NOT NULL,
    legacy_locked_circle_id text,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX matching_circles_id_session_book_uniq
    ON matching_circles (id, session_id, book_id);
  CREATE UNIQUE INDEX matching_circles_session_book_position_uniq
    ON matching_circles (session_id, book_id, position);
  CREATE UNIQUE INDEX matching_circles_legacy_locked_circle_uniq
    ON matching_circles (legacy_locked_circle_id);
  ALTER TABLE matching_circles
    ADD CONSTRAINT matching_circles_legacy_locked_circle_id_matching_locked_circles_id_fk
    FOREIGN KEY (legacy_locked_circle_id) REFERENCES matching_locked_circles(id) ON DELETE SET NULL;
  CREATE TABLE matching_book_assignments (
    session_id text NOT NULL,
    user_id text NOT NULL,
    book_id text NOT NULL,
    source text NOT NULL,
    assigned_at timestamp NOT NULL DEFAULT now(),
    assigned_by text,
    circle_id text,
    PRIMARY KEY (session_id, user_id)
  );
  CREATE OR REPLACE FUNCTION guard_initialized_matching_legacy_write() RETURNS trigger AS $$
  BEGIN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END;
  $$ LANGUAGE plpgsql;
`

async function createFixture(
  dbExec: ((sql: string) => Promise<Record<string, unknown>[]>) & { registerCleanup(sql: string): void },
  status: 'active' | 'frozen' | 'open',
) {
  const schema = schemaName()
  await dbExec(`CREATE SCHEMA "${schema}"`)
  dbExec.registerCleanup(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
  await dbExec(inSchema(schema, fixtureSchemaSql))
  const initializedAt = status === 'open' ? 'now()' : 'NULL'
  await dbExec(inSchema(schema, `
    INSERT INTO matching_sessions (id, status, state_version, book_mode_initialized_at)
      VALUES ('session', '${status}', 7, ${initializedAt});
    INSERT INTO matching_session_participants (session_id, user_id) VALUES ('session', 'member');
    INSERT INTO matching_locked_circles (id, session_id, book_id, circle_key)
      VALUES ('circle', 'session', 'book', 'circle-key');
    INSERT INTO matching_locked_circle_members
      (circle_id, session_id, user_id, display_name_snapshot)
      VALUES ('circle', 'session', 'member', 'Member');
    ${status === 'frozen' ? `
      INSERT INTO signup_books (user_id, book_id, personal_status)
        VALUES ('member', 'book', 'read');
    ` : ''}
  `))
  return schema
}

for (const [legacyStatus, canonicalStatus] of [
  ['active', 'open'],
  ['frozen', 'closed'],
] as const) {
  test(`imports locked circles and converts ${legacyStatus} to ${canonicalStatus}`, async ({ dbExec }) => {
    const schema = await createFixture(dbExec, legacyStatus)

    await runMigration(dbExec, schema)

    const rows = await dbExec(`
      SELECT session.status, assignment.user_id, assignment.book_id, assignment.source,
        circle.position, state.formed_state_version, signup.personal_status,
        to_regclass('"${schema}".matching_locked_circles') IS NULL AS legacy_removed
      FROM "${schema}".matching_sessions session
      JOIN "${schema}".matching_book_assignments assignment ON assignment.session_id = session.id
      JOIN "${schema}".matching_circles circle ON circle.id = assignment.circle_id
      JOIN "${schema}".matching_session_book_states state
        ON state.session_id = assignment.session_id AND state.book_id = assignment.book_id
      JOIN "${schema}".signup_books signup
        ON signup.user_id = assignment.user_id AND signup.book_id = assignment.book_id;
    `)
    expect(rows).toEqual([expect.objectContaining({
      status: canonicalStatus,
      user_id: 'member',
      book_id: 'book',
      source: 'legacy',
      position: 1,
      formed_state_version: 7,
      personal_status: legacyStatus === 'frozen' ? 'read' : null,
      legacy_removed: true,
    })])
  })
}

test('aborts and rolls back when canonical membership differs', async ({ dbExec }) => {
  const schema = await createFixture(dbExec, 'open')
  await dbExec(inSchema(schema, `
    INSERT INTO matching_session_participants (session_id, user_id) VALUES ('session', 'extra');
    INSERT INTO matching_circles
      (id, session_id, book_id, position, legacy_locked_circle_id)
      VALUES ('canonical', 'session', 'book', 1, 'circle');
    INSERT INTO matching_book_assignments
      (session_id, user_id, book_id, source, circle_id)
      VALUES ('session', 'extra', 'book', 'legacy', 'canonical');
  `))

  await expect(runMigration(dbExec, schema)).rejects.toThrow(
    'cannot remove matching scenarios: imported circle membership differs',
  )

  const rows = await dbExec(`
    SELECT
      to_regclass('"${schema}".matching_locked_circles') IS NOT NULL AS legacy_preserved,
      NOT EXISTS (
        SELECT 1 FROM "${schema}".signup_books WHERE user_id = 'member'
      ) AS shortlist_rolled_back;
  `)
  expect(rows).toEqual([{ legacy_preserved: true, shortlist_rolled_back: true }])
})
