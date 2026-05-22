import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id?: string
      isAdmin?: boolean
      isExcludedFromAnalytics?: boolean
      telegramUsername?: string | null
      provider?: string | null
      contactEmail?: string | null
    } & DefaultSession['user']
  }
  interface User {
    telegramUsername?: string | null
    contactEmail?: string | null
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    isAdmin?: boolean
    isExcludedFromAnalytics?: boolean
    telegramUsername?: string | null
    provider?: string | null
    contactEmail?: string | null
  }
}
