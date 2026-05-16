/**
 * @jest-environment node
 */
import { GET } from './route'

jest.mock('@/lib/intro', () => ({
  getIntroData: jest.fn().mockResolvedValue({
    header: { id: 'h1', title: 'Eyebrow', body: 'Lead' },
    sections: [{ id: 's1', title: 'Q', body: 'A', sortOrder: 0, isPublished: true }],
  }),
}))

describe('GET /api/intro', () => {
  it('returns published intro data', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.header.title).toBe('Eyebrow')
    expect(data.sections.length).toBe(1)
  })
})
