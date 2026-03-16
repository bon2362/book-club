import {
  pgTable, text, timestamp, integer, boolean, primaryKey, index,
} from 'drizzle-orm/pg-core'

export const users = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
  languages: text('languages'),
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

export const bookSuggestions = pgTable('book_suggestions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  author: text('author').notNull(),
  tags: text('tags').notNull().default(''),
  type: text('type').notNull().default('Book'),
  size: text('size').notNull().default(''),
  pages: text('pages').notNull().default(''),
  date: text('date').notNull().default(''),
  link: text('link').notNull().default(''),
  coverUrl: text('cover_url'),
  description: text('description').notNull().default(''),
  reason: text('reason').notNull(),
  submitterEmail: text('submitter_email').notNull(),
  submitterName: text('submitter_name'),
  status: text('status').notNull().default('pending'),
  rejectionReason: text('rejection_reason'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
})

export const bookNewFlags = pgTable('book_new_flags', {
  bookId:    text('book_id').primaryKey(),
  isNew:     boolean('is_new').notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
})

export const bookSubmissions = pgTable('book_submissions', {
  id:            text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId:        text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title:         text('title').notNull(),
  topic:         text('topic'),
  author:        text('author').notNull(),
  pages:         integer('pages'),
  publishedDate: text('published_date'),
  textUrl:       text('text_url'),
  description:   text('description'),
  coverUrl:      text('cover_url'),
  whyRead:          text('why_read').notNull(),
  status:           text('status').notNull().default('pending'),
  rejectionReason:  text('rejection_reason'),
  createdAt:        timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt:     timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  statusIdx: index('book_submissions_status_idx').on(t.status),
}))
