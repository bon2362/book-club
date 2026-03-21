import { NextRequest } from 'next/server'
import { signIn } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const params = Object.fromEntries(searchParams)

  try {
    await signIn('telegram', { ...params, redirectTo: '/' })
  } catch (e) {
    // signIn throws NEXT_REDIRECT — let Next.js handle it
    throw e
  }
}
