import { db } from '@/lib/db'
import { introSections } from '@/lib/db/schema'
import { asc, eq, sql } from 'drizzle-orm'

export { bodyToParagraphs } from './intro-format'

export interface IntroHeader {
  id: string
  title: string // eyebrow
  body: string  // lead text
}

export interface IntroSection {
  id: string
  title: string // question
  body: string  // answer
  sortOrder: number
  isPublished: boolean
}

export interface IntroData {
  header: IntroHeader | null
  sections: IntroSection[]
}

export const DEFAULT_HEADER = {
  title: 'Что это',
  body: 'Мы собираемся небольшими группами по 3-4 человека, чтобы раз в неделю созваниваться и обсуждать книги по демократии.',
}

export const DEFAULT_SECTIONS: { title: string; body: string }[] = [
  {
    title: 'Как это устроено?',
    body: 'Отмечайте книги, которые хотите прочитать. На пересечении интересов определяется группа из 3-4 человек.\n\nМы соберем вас в отдельный чат в Телеграм, где вы договоритесь о встречах — например, раз в неделю на ~30 минут по видеосвязи.',
  },
  {
    title: 'Для кого это?',
    body: 'Для тех, кому совместное чтение помогает в изучении демократии.\n\nМы созваниваемся с включенными камерами — это помогает вовлеченности.',
  },
  {
    title: 'Почему именно демократия?',
    body: 'Нам интересна демократия и связанные с ней темы. Нам интересен сам процесс выяснения, что означает демократия в теории и на практике. У этого процесса заведомо нет конца.\n\nПо текущему набору библиотеки можно заметить ассоциации демократии с прогрессивизмом, коллективным самоуправлением, народными движениями, свободой и равенством.\n\nМы приветствуем изменения в библиотеку — предлагайте свои книги.',
  },
  {
    title: 'Чем это не является?',
    body: 'Это не дискуссионный клуб — мы встречаемся не для дебатов. Нам окей, если после обсуждения каждый остается при своем. Мы осознаём, что данный формат — информационный пузырь. Для переубеждения есть другие форматы.',
  },
]

let bootstrapPromise: Promise<void> | null = null

async function bootstrap() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS intro_sections (
      id text PRIMARY KEY,
      kind text NOT NULL,
      sort_order integer NOT NULL DEFAULT 0,
      title text NOT NULL DEFAULT '',
      body text NOT NULL DEFAULT '',
      is_published boolean NOT NULL DEFAULT true,
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS intro_sections_kind_sort_idx
    ON intro_sections (kind, sort_order)
  `)
  await seedIfEmpty()
}

export async function ensureIntroTable() {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrap().catch(err => {
      bootstrapPromise = null
      throw err
    })
  }
  return bootstrapPromise
}

async function seedIfEmpty() {
  const existing = await db.select({ id: introSections.id }).from(introSections).limit(1)
  if (existing.length > 0) return

  await db.insert(introSections).values({
    kind: 'header',
    sortOrder: 0,
    title: DEFAULT_HEADER.title,
    body: DEFAULT_HEADER.body,
    isPublished: true,
  })
  await db.insert(introSections).values(
    DEFAULT_SECTIONS.map((s, idx) => ({
      kind: 'section',
      sortOrder: idx,
      title: s.title,
      body: s.body,
      isPublished: true,
    }))
  )
}

export async function getIntroData(opts: { onlyPublished?: boolean } = {}): Promise<IntroData> {
  await ensureIntroTable()

  const rows = await db
    .select()
    .from(introSections)
    .orderBy(asc(introSections.kind), asc(introSections.sortOrder))

  const headerRow = rows.find(r => r.kind === 'header' && (opts.onlyPublished ? r.isPublished : true))
  const sectionRows = rows
    .filter(r => r.kind === 'section')
    .filter(r => (opts.onlyPublished ? r.isPublished : true))
    .sort((a, b) => a.sortOrder - b.sortOrder)

  return {
    header: headerRow
      ? { id: headerRow.id, title: headerRow.title, body: headerRow.body }
      : null,
    sections: sectionRows.map(r => ({
      id: r.id,
      title: r.title,
      body: r.body,
      sortOrder: r.sortOrder,
      isPublished: r.isPublished,
    })),
  }
}

export interface SectionPatch {
  id: string
  title?: string
  body?: string
  sortOrder?: number
  isPublished?: boolean
}

export async function updateSections(patches: SectionPatch[]) {
  await ensureIntroTable()
  if (patches.length === 0) return
  const ids = patches.map(p => p.id)
  const rows = await db
    .select({ id: introSections.id, kind: introSections.kind })
    .from(introSections)
  const kindById = new Map(rows.filter(r => ids.includes(r.id)).map(r => [r.id, r.kind]))

  for (const p of patches) {
    const kind = kindById.get(p.id)
    if (!kind) continue
    const set: Record<string, unknown> = { updatedAt: new Date() }
    if (p.title !== undefined) set.title = p.title
    if (p.body !== undefined) set.body = p.body
    // header is а single row: sortOrder/isPublished не имеют смысла и не редактируются клиентом
    if (kind === 'section') {
      if (p.sortOrder !== undefined) set.sortOrder = p.sortOrder
      if (p.isPublished !== undefined) set.isPublished = p.isPublished
    }
    await db.update(introSections).set(set).where(eq(introSections.id, p.id))
  }
}

export async function createSection(): Promise<IntroSection> {
  await ensureIntroTable()
  const existing = await db
    .select({ sortOrder: introSections.sortOrder })
    .from(introSections)
    .where(eq(introSections.kind, 'section'))
  const maxOrder = existing.reduce((m, r) => Math.max(m, r.sortOrder), -1)
  const [row] = await db
    .insert(introSections)
    .values({
      kind: 'section',
      sortOrder: maxOrder + 1,
      title: 'Новый вопрос',
      body: '',
      isPublished: false,
    })
    .returning()
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    sortOrder: row.sortOrder,
    isPublished: row.isPublished,
  }
}

export async function deleteSection(id: string): Promise<{ ok: boolean; reason?: string }> {
  await ensureIntroTable()
  const [row] = await db
    .select({ kind: introSections.kind })
    .from(introSections)
    .where(eq(introSections.id, id))
    .limit(1)
  if (!row) return { ok: false, reason: 'not_found' }
  if (row.kind !== 'section') return { ok: false, reason: 'header_protected' }
  await db.delete(introSections).where(eq(introSections.id, id))
  return { ok: true }
}

