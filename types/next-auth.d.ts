import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      isAdmin?: boolean
      telegramUsername?: string | null
    } & DefaultSession['user']
  }
  interface User {
    telegramUsername?: string | null
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    isAdmin?: boolean
    telegramUsername?: string | null
  }
}
