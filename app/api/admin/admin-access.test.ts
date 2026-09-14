/**
 * @jest-environment node
 */
import { readdirSync } from 'fs'
import { join, relative } from 'path'
import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
// Любое обращение к базе до проверки прав — дыра: подделка бросает на первом же доступе.
jest.mock('@/lib/db', () => ({
  db: new Proxy({}, {
    get: (_target, property) => {
      throw new Error(`db.${String(property)} вызван до проверки прав администратора`)
    },
  }),
}))

// Сам находит все маршруты app/api/admin/**/route.ts, поэтому новый админский маршрут
// без проверки прав ловится без отдельного теста. Заменяет выборочные ночные E2E-проверки
// «403 для не-админа»: те шли после мержа и покрывали 4 маршрута из 50.
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const
type Handler = (request: NextRequest, context: { params: Record<string, string> }) => Promise<Response>

function findRouteFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return findRouteFiles(path)
    return entry.name === 'route.ts' ? [path] : []
  })
}

const routeFiles = findRouteFiles(join(process.cwd(), 'app/api/admin')).sort()
const probeParams = new Proxy({} as Record<string, string>, {
  get: (_target, key) => (typeof key === 'string' ? 'admin-access-probe' : undefined),
})
const sessions = [
  ['гость', null],
  ['пользователь без флага админа', { user: { id: 'user-1', email: 'user@test.invalid' } }],
  ['пользователь с isAdmin: false', { user: { id: 'user-1', email: 'user@test.invalid', isAdmin: false } }],
] as const

it('находит админские маршруты', () => {
  expect(routeFiles.length).toBeGreaterThan(40)
})

it.each(routeFiles.map((file) => [relative(process.cwd(), file), file]))(
  '%s отказывает гостю и не-админу, не трогая базу',
  async (_name, file) => {
    const routeModule = (await import(file)) as Partial<Record<(typeof METHODS)[number], Handler>>
    const methods = METHODS.filter((method) => typeof routeModule[method] === 'function')
    expect(methods.length).toBeGreaterThan(0)

    const leaks: string[] = []
    for (const [label, session] of sessions) {
      ;(auth as jest.Mock).mockResolvedValue(session)
      for (const method of methods) {
        const request = new NextRequest('http://localhost/api/admin/probe', {
          method,
          ...(method === 'GET' ? {} : { body: '{}', headers: { 'content-type': 'application/json' } }),
        })
        try {
          const { status } = await routeModule[method]!(request, { params: probeParams })
          if (status !== 401 && status !== 403) leaks.push(`${method} (${label}) → ${status}`)
        } catch (error) {
          leaks.push(`${method} (${label}) → исключение: ${(error as Error).message}`)
        }
      }
    }

    expect(leaks).toEqual([])
  },
)
