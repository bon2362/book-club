import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import { test, expect } from '../../fixtures'

const migrationSql = readFileSync(join(process.cwd(), 'drizzle/0061_matching_multibook.sql'), 'utf8')

function schemaName() {
  return `e2e_matching_multibook_${randomUUID().replaceAll('-', '')}`
}

function inSchema(schema: string, sql: string) {
  return `BEGIN;\nSET LOCAL search_path TO "${schema}";\n${sql}\nCOMMIT;`
}

test('migration preserves canonical rows and permits distinct books per participant', async ({ dbExec }) => {
  const schema = schemaName()
  await dbExec(`CREATE SCHEMA "${schema}"`)
  dbExec.registerCleanup(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)

  await dbExec(inSchema(schema, `
    CREATE TABLE matching_book_intents (
      session_id text NOT NULL,
      user_id text NOT NULL,
      book_id text NOT NULL,
      kind text NOT NULL,
      PRIMARY KEY (session_id, user_id, book_id)
    );
    CREATE UNIQUE INDEX matching_book_intents_session_user_hard_uniq
      ON matching_book_intents (session_id, user_id) WHERE kind = 'hard';
    CREATE TABLE matching_book_assignments (
      session_id text NOT NULL,
      user_id text NOT NULL,
      book_id text NOT NULL,
      source text NOT NULL,
      CONSTRAINT matching_book_assignments_session_user_pk PRIMARY KEY (session_id, user_id)
    );
    CREATE TABLE audit_log (
      id text NOT NULL,
      actor_user_id text,
      actor_label text,
      source text NOT NULL,
      action text NOT NULL,
      entity_type text NOT NULL,
      entity_id text,
      before jsonb,
      after jsonb,
      changed_fields jsonb,
      reason text
    );
    CREATE FUNCTION audit_capture() RETURNS trigger AS $$
    BEGIN
      INSERT INTO audit_log (id, source, action, entity_type, entity_id, after)
      VALUES (gen_random_uuid()::text, 'trigger', lower(TG_OP), TG_TABLE_NAME,
        NEW.session_id || ':' || NEW.user_id, to_jsonb(NEW));
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER audit_matching_book_assignments
      AFTER INSERT ON matching_book_assignments
      FOR EACH ROW EXECUTE FUNCTION audit_capture();
    INSERT INTO matching_book_intents VALUES ('session', 'user', 'book-1', 'hard');
    INSERT INTO matching_book_assignments VALUES ('session', 'user', 'book-1', 'hard');
  `))

  await dbExec(inSchema(schema, migrationSql))
  await dbExec(inSchema(schema, `
    INSERT INTO matching_book_intents VALUES ('session', 'user', 'book-2', 'hard');
    INSERT INTO matching_book_assignments VALUES ('session', 'user', 'book-2', 'hard');
    INSERT INTO matching_book_assignments VALUES ('session', 'user', 'book-3', 'hard');
  `))

  const rows = await dbExec(`
    SELECT
      (SELECT array_agg(book_id ORDER BY book_id) FROM "${schema}".matching_book_intents) AS intent_books,
      (SELECT array_agg(book_id ORDER BY book_id) FROM "${schema}".matching_book_assignments) AS assignment_books,
      (SELECT count(*)::int FROM "${schema}".audit_log) AS audit_rows,
      (SELECT array_agg(entity_id ORDER BY entity_id) FROM "${schema}".audit_log) AS audit_entity_ids,
      EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = '"${schema}".matching_book_assignments'::regclass
          AND tgname = 'audit_matching_book_assignments'
          AND NOT tgisinternal
      ) AS audit_trigger_present;
  `)
  expect(rows).toEqual([{
    intent_books: ['book-1', 'book-2'],
    assignment_books: ['book-1', 'book-2', 'book-3'],
    audit_rows: 3,
    audit_entity_ids: ['session:user', 'session:user:book-2', 'session:user:book-3'],
    audit_trigger_present: true,
  }])

  await expect(dbExec(`
    INSERT INTO "${schema}".matching_book_assignments
      (session_id, user_id, book_id, source)
    VALUES ('session', 'user', 'book-2', 'hard');
  `)).rejects.toThrow()
})
