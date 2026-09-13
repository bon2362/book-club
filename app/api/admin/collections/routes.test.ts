/** @jest-environment node */
import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import * as repo from '@/lib/collections/repo'
import * as settings from '@/lib/site-settings'
import { DELETE, GET as oneGET, PATCH } from './[id]/route'
import { POST as action } from './[id]/actions/route'
import { GET as queueGET } from './route'
import { GET as settingsGET, PATCH as settingsPATCH } from './settings/route'
jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/audit/with-audit-context', () => ({ withAuditContext: (_ctx: unknown, fn: (tx: unknown) => unknown) => fn({}) }))
jest.mock('@/lib/collections/repo', () => ({ listAdminQueue: jest.fn(), loadCollectionById: jest.fn(), loadEditorBooks: jest.fn(), saveCollectionContent: jest.fn(), deleteCollection: jest.fn(), applyAdminCollectionAction: jest.fn(), serializeCollection: jest.fn((record) => record) }))
jest.mock('@/lib/site-settings', () => ({ getSiteSetting: jest.fn(), setSiteSetting: jest.fn() }))
const mockAuth = auth as jest.Mock
const req = (body?: unknown, method = 'POST') => new NextRequest('http://x', { method, body: body === undefined ? undefined : JSON.stringify(body) })
const params = { params: { id: 'c1' } }
beforeEach(() => { jest.clearAllMocks(); mockAuth.mockResolvedValue({ user: { id: 'admin', name: 'Owner', isAdmin: true } }) })
it('rejects every endpoint for non-admin', async () => { mockAuth.mockResolvedValue({ user: { id: 'u', isAdmin: false } }); expect((await queueGET()).status).toBe(403); expect((await oneGET(req(undefined, 'GET'), params)).status).toBe(403); expect((await PATCH(req({}, 'PATCH'), params)).status).toBe(403); expect((await DELETE(req(undefined, 'DELETE'), params)).status).toBe(403); expect((await action(req({ action: 'publish' }), params)).status).toBe(403); expect((await settingsGET()).status).toBe(403); expect((await settingsPATCH(req({ homeBlockEnabled: true }, 'PATCH'))).status).toBe(403) })
it('returns a diff against reviewed snapshot', async () => { (repo.loadCollectionById as jest.Mock).mockResolvedValue({ id: 'c1', status: 'published', title: 'Т', descriptionMarkdown: 'О', displayName: 'П', bookIds: ['a', 'b'], reviewedSnapshot: { title: 'Т', descriptionMarkdown: 'О', displayName: 'П', bookIds: ['a'] } }); (repo.loadEditorBooks as jest.Mock).mockResolvedValue([]); expect((await (await oneGET(req(undefined, 'GET'), params)).json()).diff.added).toEqual(['b']) })
it('rejects unknown moderation action', async () => { expect((await action(req({ action: 'explode' }), params)).status).toBe(400) })
it('passes reject reason', async () => { (repo.applyAdminCollectionAction as jest.Mock).mockResolvedValue({ id: 'c1' }); await action(req({ action: 'reject', reason: 'Мало текста' }), params); expect(repo.applyAdminCollectionAction).toHaveBeenCalledWith({}, expect.objectContaining({ id: 'c1', action: 'reject', reason: 'Мало текста' })) })
it('saves from admin', async () => { (repo.saveCollectionContent as jest.Mock).mockResolvedValue({ id: 'c1' }); await PATCH(req({ title: 'Т', descriptionMarkdown: '', displayName: '', bookIds: [] }, 'PATCH'), params); expect(repo.saveCollectionContent).toHaveBeenCalledWith({}, expect.objectContaining({ by: 'admin' })) })
it('reads and writes setting', async () => { (settings.getSiteSetting as jest.Mock).mockResolvedValue(false); expect(await (await settingsGET()).json()).toEqual({ homeBlockEnabled: false }); const response = await settingsPATCH(req({ homeBlockEnabled: true }, 'PATCH')); expect(settings.setSiteSetting).toHaveBeenCalledWith({}, 'collections_home_block_enabled', true); expect(await response.json()).toEqual({ homeBlockEnabled: true }) })
it('rejects non-boolean setting', async () => { expect((await settingsPATCH(req({ homeBlockEnabled: 'yes' }, 'PATCH'))).status).toBe(400) })
