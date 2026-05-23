import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id?: string
      isAdmin?: boolean
      isExcludedFromAnalytics?: boolean
      provider?: string | null
      contactEmail?: string | null
    } & DefaultSession['user']
  }
  interface User {
    contactEmail?: string | null
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    isAdmin?: boolean
    isExcludedFromAnalytics?: boolean
    provider?: string | null
    contactEmail?: string | null
  }
}
