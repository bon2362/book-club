import {
  pgTable, text, timestamp, integer, primaryKey,
} from 'drizzle-orm/pg-core'

export const users = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
})

export const accounts = pgTable('account', {
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('providerAccountId').notNull(),
  refresh_token: text('refresh_token'),
  access_token: text('access_token'),
  expires_at: integer('expires_at'),
  token_type: text('token_type'),
  scope: text('scope'),
  id_token: text('id_token'),
  session_state: text('session_state'),
}, (t) => ({
  pk: primaryKey({ columns: [t.provider, t.providerAccountId] }),
}))

export const sessions = pgTable('session', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
})

export const verificationTokens = pgTable('verificationToken', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull(),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.identifier, t.token] }),
}))

export const bookCovers = pgTable('book_covers', {
  bookId:    text('book_id').primaryKey(),
  coverUrl:  text('cover_url'),
  fetchedAt: timestamp('fetched_at', { mode: 'date' }).notNull().defaultNow(),
})

export const bookStatuses = pgTable('book_statuses', {
  bookId: text('book_id').primaryKey(),
  status: text('status').notNull(), // 'reading' | 'read'
})

export const tagDescriptions = pgTable('tag_descriptions', {
  tag: text('tag').primaryKey(),
  description: text('description').notNull(),
})
