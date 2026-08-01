/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { TIMELINE_PALETTE } from '../components/nd/timeline/admin/palette'

describe('0057 timeline type colors migration', () => {
  const sql = readFileSync(join(process.cwd(), 'drizzle/0057_timeline_type_colors.sql'), 'utf8')

  const expectedUpdates = [
    { title: 'Книга', color: '#B0603C' },
    { title: 'Событие', color: '#5D7290' },
    { title: 'Личность', color: '#57795F' },
  ]

  it.each(expectedUpdates)('updates $title to the matching event palette color', ({ title, color }) => {
    expect(TIMELINE_PALETTE).toContainEqual(expect.objectContaining({ value: color }))
    expect(sql).toContain(`SET "color" = '${color}'`)
    expect(sql).toContain(`WHERE "title" = '${title}' AND "color" <> '${color}'`)
  })

  it('contains exactly three event type updates', () => {
    expect(sql.match(/UPDATE "historical_event_types"/g)).toHaveLength(3)
  })
})
