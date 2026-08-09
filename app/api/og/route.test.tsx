/**
 * @jest-environment node
 */
jest.mock('next/og', () => ({
  ImageResponse: jest.fn().mockImplementation(() => new Response('image')),
}))

jest.mock('@/lib/books', () => ({
  fetchBooksWithCovers: jest.fn().mockResolvedValue([]),
}))

import { fetchBooksWithCovers } from '@/lib/books'
import { GET } from './route'

describe('GET /api/og', () => {
  it('generates the social image without reading the book catalog', async () => {
    const response = await GET()

    expect(response).toBeInstanceOf(Response)
    expect(fetchBooksWithCovers).not.toHaveBeenCalled()
  })
})
