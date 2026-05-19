import {
  pgTable, text, timestamp, integer, boolean, primaryKey, index, uniqueIndex,
} from 'drizzle-orm/pg-core'

export const users = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  image: text('image'),
  contacts: text('contacts'),
  telegramUsername: text('telegram_username'),
  // Allowed values: 'google' | 'email' | 'google-one-tap' | 'telegram' | 'telegram-preauth'
  authProvider: text('auth_provider'),
  lastSignInAt: timestamp('last_sign_in_at', { mode: 'date' }),
  lastActivityAt: timestamp('last_activity_at', { mode: 'date' }),
  languages: text('languages'),
  prioritiesSet: boolean('priorities_set').notNull().default(false),
  isAdmin: boolean('is_admin').notNull().default(false),
})

export const userActivityEvents = pgTable('user_activity_events', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  occurredAt: timestamp('occurred_at', { mode: 'date' }).notNull().defaultNow(),
  source: text('source'),
  sourceId: text('source_id'),
  dedupeKey: text('dedupe_key'),
  metadata: text('metadata'),
}, (t) => ({
  userIdOccurredAtIdx: index('user_activity_events_user_id_occurred_at_idx').on(t.userId, t.occurredAt),
  dedupeKeyIdx: uniqueIndex('user_activity_events_dedupe_key_idx').on(t.dedupeKey),
}))

export const userIdentities = pgTable('user_identities', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  email: text('email'),
  telegramUsername: text('telegram_username'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { mode: 'date' }).notNull().defaultNow(),
  metadata: text('metadata'),
}, (t) => ({
  providerAccountUnique: uniqueIndex('user_identities_provider_account_id_idx').on(t.provider, t.providerAccountId),
  userIdIdx: index('user_identities_user_id_idx').on(t.userId),
}))

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

export const bookStatuses = pgTable('book_statuses', {
  bookId: text('book_id').primaryKey(),
  status: text('status').notNull(), // 'reading' | 'read'
})

export const tagDescriptions = pgTable('tag_descriptions', {
  tag: text('tag').primaryKey(),
  description: text('description').notNull(),
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

export const bookPriorities = pgTable('book_priorities', {
  userId:    text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  bookName:  text('book_name').notNull(),
  rank:      integer('rank').notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.bookName] }),
}))

export const signupBooks = pgTable('signup_books', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  bookName: text('book_name').notNull(),
  signedAt: timestamp('signed_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.bookName] }),
}))

export const feedback = pgTable('feedback', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  name: text('name'),
  email: text('email'),
  message: text('message').notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
})

export const introSections = pgTable('intro_sections', {
  id:          text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  kind:        text('kind').notNull(), // 'header' | 'section'
  sortOrder:   integer('sort_order').notNull().default(0),
  title:       text('title').notNull().default(''),
  body:        text('body').notNull().default(''),
  isPublished: boolean('is_published').notNull().default(true),
  updatedAt:   timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  kindIdx: index('intro_sections_kind_sort_idx').on(t.kind, t.sortOrder),
}))

export const notificationQueue = pgTable('notification_queue', {
  id:           text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userName:     text('user_name').notNull(),
  userEmail:    text('user_email').notNull(),
  contacts:     text('contacts').notNull(),
  addedBooks:   text('added_books').notNull(), // JSON.stringify(string[]) — books added in this signup event
  isNew:        boolean('is_new').notNull(),
  createdAt:    timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  processingAt: timestamp('processing_at', { mode: 'date' }), // NULL = free; NOT NULL = claimed by cron
  sentAt:       timestamp('sent_at', { mode: 'date' }),        // NULL = unsent; NOT NULL = sent
}, (t) => ({
  sentAtIdx: index('notification_queue_sent_at_idx').on(t.sentAt),
}))

export const telegramPreauthTokens = pgTable('telegram_preauth_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
  usedAt: timestamp('used_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  userIdIdx: index('telegram_preauth_tokens_user_id_idx').on(t.userId),
  expiresAtIdx: index('telegram_preauth_tokens_expires_at_idx').on(t.expiresAt),
}))
