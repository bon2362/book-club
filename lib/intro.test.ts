/**
 * @jest-environment node
 */
import { bodyToParagraphs } from './intro-format'

describe('bodyToParagraphs', () => {
  it('returns single paragraph for plain text', () => {
    expect(bodyToParagraphs('Hello world')).toEqual(['Hello world'])
  })
  it('splits on double newlines', () => {
    expect(bodyToParagraphs('First.\n\nSecond.')).toEqual(['First.', 'Second.'])
  })
  it('splits on more than two newlines', () => {
    expect(bodyToParagraphs('First.\n\n\n\nSecond.')).toEqual(['First.', 'Second.'])
  })
  it('keeps single newlines inside a paragraph', () => {
    expect(bodyToParagraphs('Line 1\nLine 2')).toEqual(['Line 1\nLine 2'])
  })
  it('trims whitespace around paragraphs', () => {
    expect(bodyToParagraphs('  First.  \n\n  Second.  ')).toEqual(['First.', 'Second.'])
  })
  it('filters empty paragraphs', () => {
    expect(bodyToParagraphs('First.\n\n\n\n\n\nSecond.\n\n   ')).toEqual(['First.', 'Second.'])
  })
  it('returns empty array for empty input', () => {
    expect(bodyToParagraphs('')).toEqual([])
    expect(bodyToParagraphs('   ')).toEqual([])
  })
})

// In-memory fake DB that mimics enough of Drizzle's chainable+thenable API for lib/intro.ts.
interface Row {
  id: string
  kind: string
  sortOrder: number
  title: string
  body: string
  isPublished: boolean
  updatedAt: Date
}

let rows: Row[]
let idCounter: number

function selectChain(cols?: Record<string, unknown>): any { // eslint-disable-line @typescript-eslint/no-explicit-any
  const fields = cols ? Object.keys(cols) : null
  const filters: { col: string; val: string }[] = []
  let limitN: number | undefined
  const project = (r: Row) => {
    if (!fields) return { ...r }
    const out: Record<string, unknown> = {}
    for (const k of fields) out[k] = (r as unknown as Record<string, unknown>)[k]
    return out
  }
  const finalize = () => {
    let out = rows
    for (const f of filters) out = out.filter(r => (r as unknown as Record<string, unknown>)[f.col] === f.val)
    if (limitN !== undefined) out = out.slice(0, limitN)
    return out.map(project)
  }
  const builder: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
    from: () => builder,
    where: (cond: { __col?: string; __val?: string }) => {
      if (cond?.__col) filters.push({ col: cond.__col, val: cond.__val! })
      return builder
    },
    orderBy: () => builder,
    limit: (n: number) => { limitN = n; return builder },
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(finalize()).then(resolve, reject),
  }
  return builder
}

jest.mock('@/lib/db', () => ({
  db: {
    execute: jest.fn().mockResolvedValue(undefined),
    select: jest.fn((cols?: Record<string, unknown>) => selectChain(cols)),
    insert: jest.fn(() => ({
      values: (val: Partial<Row> | Partial<Row>[]) => {
        const arr = Array.isArray(val) ? val : [val]
        const inserted = arr.map(v => {
          const row: Row = {
            id: v.id ?? `row-${++idCounter}`,
            kind: v.kind ?? 'section',
            sortOrder: v.sortOrder ?? 0,
            title: v.title ?? '',
            body: v.body ?? '',
            isPublished: v.isPublished ?? true,
            updatedAt: new Date(),
          }
          rows.push(row)
          return row
        })
        return {
          returning: () => Promise.resolve(inserted),
          then: (resolve: (v: unknown) => unknown) => Promise.resolve(undefined).then(resolve),
        }
      },
    })),
    update: jest.fn(() => ({
      set: (patch: Partial<Row>) => ({
        where: (cond: { __col?: string; __val?: string }) => {
          if (cond?.__col === 'id' && cond.__val) {
            rows = rows.map(r => (r.id === cond.__val ? { ...r, ...patch } : r))
          }
          return Promise.resolve(undefined)
        },
      }),
    })),
    delete: jest.fn(() => ({
      where: (cond: { __col?: string; __val?: string }) => {
        if (cond?.__col === 'id' && cond.__val) {
          rows = rows.filter(r => r.id !== cond.__val)
        }
        return Promise.resolve(undefined)
      },
    })),
  },
}))

jest.mock('drizzle-orm', () => ({
  asc: () => undefined,
  eq: (col: string, val: string) => ({ __col: col, __val: val }),
  sql: () => undefined,
}))

// Schema mock — fake column references so chain calls don't blow up
jest.mock('@/lib/db/schema', () => ({
  introSections: { id: 'id', kind: 'kind', sortOrder: 'sortOrder', title: 'title', body: 'body', isPublished: 'isPublished', updatedAt: 'updatedAt' },
}))

describe('lib/intro DB functions', () => {
  beforeEach(() => {
    jest.resetModules()
    rows = []
    idCounter = 0
  })

  it('getIntroData seeds defaults on empty table and returns header + sections', async () => {
    const intro = await import('./intro')
    const data = await intro.getIntroData({ onlyPublished: true })
    expect(data.header).not.toBeNull()
    expect(data.header?.title).toBe(intro.DEFAULT_HEADER.title)
    expect(data.sections.length).toBe(intro.DEFAULT_SECTIONS.length)
    expect(data.sections[0].title).toBe(intro.DEFAULT_SECTIONS[0].title)
  })

  it('getIntroData with onlyPublished=true hides unpublished header', async () => {
    const intro = await import('./intro')
    await intro.getIntroData()
    const headerRow = rows.find(r => r.kind === 'header')!
    rows = rows.map(r => (r.id === headerRow.id ? { ...r, isPublished: false } : r))
    const data = await intro.getIntroData({ onlyPublished: true })
    expect(data.header).toBeNull()
  })

  it('getIntroData returns unpublished sections when onlyPublished=false', async () => {
    const intro = await import('./intro')
    await intro.getIntroData()
    rows = rows.map(r => (r.kind === 'section' ? { ...r, isPublished: false } : r))
    const publicData = await intro.getIntroData({ onlyPublished: true })
    expect(publicData.sections.length).toBe(0)
    const adminData = await intro.getIntroData({ onlyPublished: false })
    expect(adminData.sections.length).toBeGreaterThan(0)
  })

  it('updateSections updates section fields and ignores sort_order/is_published on header', async () => {
    const intro = await import('./intro')
    await intro.getIntroData()
    const headerRow = rows.find(r => r.kind === 'header')!
    const sectionRow = rows.find(r => r.kind === 'section')!
    await intro.updateSections([
      { id: headerRow.id, title: 'new eyebrow', sortOrder: 999, isPublished: false },
      { id: sectionRow.id, title: 'new q', sortOrder: 7, isPublished: false },
    ])
    const updatedHeader = rows.find(r => r.id === headerRow.id)!
    expect(updatedHeader.title).toBe('new eyebrow')
    expect(updatedHeader.sortOrder).toBe(headerRow.sortOrder) // not changed
    expect(updatedHeader.isPublished).toBe(true) // not changed
    const updatedSection = rows.find(r => r.id === sectionRow.id)!
    expect(updatedSection.title).toBe('new q')
    expect(updatedSection.sortOrder).toBe(7)
    expect(updatedSection.isPublished).toBe(false)
  })

  it('updateSections no-ops for empty patch list and unknown ids', async () => {
    const intro = await import('./intro')
    await intro.getIntroData()
    const before = rows.map(r => ({ ...r }))
    await intro.updateSections([])
    await intro.updateSections([{ id: 'no-such-id', title: 'x' }])
    expect(rows.map(r => r.title)).toEqual(before.map(r => r.title))
  })

  it('createSection appends a section with sortOrder = max+1', async () => {
    const intro = await import('./intro')
    await intro.getIntroData()
    const before = rows.filter(r => r.kind === 'section').length
    const maxOrder = Math.max(...rows.filter(r => r.kind === 'section').map(r => r.sortOrder))
    const created = await intro.createSection()
    expect(rows.filter(r => r.kind === 'section').length).toBe(before + 1)
    expect(created.sortOrder).toBe(maxOrder + 1)
    expect(created.isPublished).toBe(false)
  })

  it('deleteSection refuses to delete header and returns reason', async () => {
    const intro = await import('./intro')
    await intro.getIntroData()
    const headerRow = rows.find(r => r.kind === 'header')!
    const result = await intro.deleteSection(headerRow.id)
    expect(result).toEqual({ ok: false, reason: 'header_protected' })
    expect(rows.find(r => r.id === headerRow.id)).toBeDefined()
  })

  it('deleteSection returns not_found for missing id', async () => {
    const intro = await import('./intro')
    await intro.getIntroData()
    const result = await intro.deleteSection('does-not-exist')
    expect(result).toEqual({ ok: false, reason: 'not_found' })
  })

  it('deleteSection removes a section', async () => {
    const intro = await import('./intro')
    await intro.getIntroData()
    const sectionRow = rows.find(r => r.kind === 'section')!
    const result = await intro.deleteSection(sectionRow.id)
    expect(result.ok).toBe(true)
    expect(rows.find(r => r.id === sectionRow.id)).toBeUndefined()
  })

  it('ensureIntroTable bootstrap is cached across calls', async () => {
    const intro = await import('./intro')
    const { db } = jest.requireMock('@/lib/db') as { db: { execute: jest.Mock } }
    db.execute.mockClear()
    await intro.ensureIntroTable()
    await intro.ensureIntroTable()
    await intro.ensureIntroTable()
    expect(db.execute).toHaveBeenCalledTimes(2) // CREATE TABLE + CREATE INDEX, once
  })
})
