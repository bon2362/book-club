/** @jest-environment node */
import { NextRequest } from 'next/server'
import { CollectionError } from './errors'
import { collectionErrorResponse, readContentBody, viewerFromSession } from './http'

describe('collectionErrorResponse', () => {
  it.each([
    ['not_found', 404], ['forbidden', 403], ['invalid_transition', 409], ['validation', 400],
    ['book_not_published', 400], ['migration_required', 409],
  ] as const)('%s maps to %i', async (code, status) => {
    const response = collectionErrorResponse(new CollectionError(code, { issues: ['x'] }))
    expect(response.status).toBe(status)
    expect(await response.json()).toMatchObject({ error: code, issues: ['x'] })
  })

  it('maps a missing table to migration_required', async () => {
    const response = collectionErrorResponse(Object.assign(new Error('relation does not exist'), { code: '42P01' }))
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'migration_required' })
  })

  it('returns 500 for unexpected errors', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
    expect(collectionErrorResponse(new Error('boom')).status).toBe(500)
  })
})

describe('readContentBody', () => {
  const request = (body: unknown) => new NextRequest('http://x', { method: 'PATCH', body: JSON.stringify(body) })
  it('coerces fields to strings and a string array', async () => {
    await expect(readContentBody(request({ title: 'T', descriptionMarkdown: 'D', displayName: 'N', bookIds: ['a', 1] })))
      .resolves.toEqual({ title: 'T', descriptionMarkdown: 'D', displayName: 'N', bookIds: ['a'] })
  })
  it('rejects an invalid JSON body', async () => {
    await expect(readContentBody(new NextRequest('http://x', { method: 'PATCH', body: '{' }))).rejects.toMatchObject({ code: 'validation' })
  })
})

describe('viewerFromSession', () => {
  it('creates guest and administrator viewers', () => {
    expect(viewerFromSession(null)).toEqual({ userId: null, isAdmin: false })
    expect(viewerFromSession({ user: { id: 'a', isAdmin: true } } as never)).toEqual({ userId: 'a', isAdmin: true })
  })
})
