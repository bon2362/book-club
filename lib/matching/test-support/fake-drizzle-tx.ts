/**
 * Поддельная drizzle-транзакция для unit-тестов запретов матчинга.
 *
 * SQL не исполняется и условия WHERE не читаются: каждый select из таблицы по очереди
 * получает заранее заданный набор строк, а все insert/update/delete записываются в
 * `writes`. Этого достаточно, чтобы проверить ветку кода — отказ с нужным кодом и
 * отсутствие записей до отказа. Правильность самих условий запроса проверяют
 * интеграционные E2E в `e2e/integration/matching`.
 */
export type FakeRow = Record<string, unknown>
export type FakeRows = Record<string, FakeRow[][]>

export interface FakeWrite {
  op: 'insert' | 'update' | 'delete'
  table: string
  values?: unknown
}

export interface FakeTxOptions {
  /** Очередь результатов select по имени таблицы: `{ signupBooks: [[{ personalStatus: null }]] }`. */
  rows?: FakeRows
  /** Ошибка, которую бросит update указанной таблицы. */
  failOnUpdate?: Record<string, unknown>
}

interface FakeQuery extends PromiseLike<FakeRow[]> {
  from(table: unknown): FakeQuery
  innerJoin(...args: unknown[]): FakeQuery
  where(...args: unknown[]): FakeQuery
  limit(...args: unknown[]): FakeQuery
  orderBy(...args: unknown[]): FakeQuery
  values(values: unknown): FakeQuery
  set(values: unknown): FakeQuery
  onConflictDoNothing(...args: unknown[]): FakeQuery
  onConflictDoUpdate(...args: unknown[]): FakeQuery
  returning(...args: unknown[]): FakeQuery
}

const TABLE = '__fakeTable'

function tableName(table: unknown): string {
  return (table as Record<string, string>)[TABLE]
}

function fakeQuery(hooks: {
  from?: (table: string) => void
  values?: (values: unknown) => void
  settle: () => FakeRow[]
}): FakeQuery {
  const self: FakeQuery = {
    from: (table) => { hooks.from?.(tableName(table)); return self },
    innerJoin: () => self,
    where: () => self,
    limit: () => self,
    orderBy: () => self,
    values: (values) => { hooks.values?.(values); return self },
    set: (values) => { hooks.values?.(values); return self },
    onConflictDoNothing: () => self,
    onConflictDoUpdate: () => self,
    returning: () => self,
    then: (onFulfilled, onRejected) => new Promise<FakeRow[]>((resolve) => resolve(hooks.settle()))
      .then(onFulfilled, onRejected),
  }
  return self
}

export function createFakeTx(options: FakeTxOptions = {}) {
  const queues = new Map(Object.entries(options.rows ?? {}).map(([table, results]) => [table, [...results]]))
  const writes: FakeWrite[] = []
  const executed: unknown[] = []

  function write(op: FakeWrite['op'], table: unknown, settle: () => FakeRow[] = () => [{}]) {
    const entry: FakeWrite = { op, table: tableName(table) }
    writes.push(entry)
    // По умолчанию запись «затрагивает одну строку», чтобы returning() не выглядел пустым.
    return fakeQuery({ values: (values) => { entry.values = values }, settle })
  }

  return {
    writes,
    executed,
    select: () => {
      let table = ''
      return fakeQuery({ from: (name) => { table = name }, settle: () => queues.get(table)?.shift() ?? [] })
    },
    insert: (table: unknown) => write('insert', table),
    update: (table: unknown) => write('update', table, () => {
      const error = options.failOnUpdate?.[tableName(table)]
      if (error) throw error
      return [{}]
    }),
    delete: (table: unknown) => write('delete', table),
    execute: async (statement: unknown) => {
      executed.push(statement)
      return { rows: [] }
    },
  }
}

const TABLES = [
  'users', 'books', 'bookPriorities', 'signupBooks', 'matchingSessions', 'matchingSessionParticipants',
  'matchingBookIntents', 'matchingSessionBookStates', 'matchingCircles', 'matchingBookAssignments',
  'matchingEvents', 'matchingNotices',
]

/** Подмена `@/lib/db/schema`: таблица знает своё имя, колонка — строка `таблица.колонка`. */
export function fakeSchema(): Record<string, unknown> {
  return Object.fromEntries(TABLES.map((name) => [name, new Proxy({ [TABLE]: name }, {
    get: (_target, property) => property === TABLE ? name : `${name}.${String(property)}`,
  })]))
}

/** Подмена `drizzle-orm`: выражения для SQL поддельная транзакция не читает. */
export function fakeDrizzleOrm(): Record<string, () => undefined> {
  const noop = () => undefined
  return { and: noop, asc: noop, eq: noop, inArray: noop, isNull: noop, sql: noop }
}
