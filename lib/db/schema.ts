import {
  pgTable, text, timestamp, integer, boolean, primaryKey, index, uniqueIndex, jsonb,
} from 'drizzle-orm/pg-core'

export const users = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name'),
  contactEmail: text('contact_email'),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  image: text('image'),
  contacts: text('contacts'),
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

export const verificationTokens = pgTable('verificationToken', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull(),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.identifier, t.token] }),
}))

// New canonical books catalog (replaces Sheets + book_statuses + book_new_flags merge).
// See docs/planning-artifacts/books-catalog-db-refactor-plan.md.
export const books = pgTable('books', {
  id: text('id').primaryKey(),
  canonicalKey: text('canonical_key'),
  title: text('title').notNull(),
  author: text('author').notNull().default(''),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  type: text('type').notNull().default('book'), // 'book' | 'article'
  size: text('size').notNull().default(''),
  pages: integer('pages'),
  publishedDate: text('published_date').notNull().default(''),
  textUrl: text('text_url').notNull().default(''),
  description: text('description').notNull().default(''),
  coverUrl: text('cover_url'),
  whyRead: text('why_read'),
  recommendationLink: text('recommendation_link'),
  readingStatus: text('reading_status'), // null | 'reading' | 'read'
  visibility: text('visibility').notNull().default('hidden'), // 'hidden' | 'published'
  isNew: boolean('is_new').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  source: text('source').notNull().default('admin'), // 'admin' | 'submission' | 'sheets_import'
  sourceSubmissionId: text('source_submission_id'),
  legacySheetsRowId: text('legacy_sheets_row_id'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  publishedAt: timestamp('published_at', { mode: 'date' }),
  hiddenAt: timestamp('hidden_at', { mode: 'date' }),
  archivedAt: timestamp('archived_at', { mode: 'date' }),
}, (t) => ({
  visibilityIdx: index('books_visibility_idx').on(t.visibility),
  sourceSubmissionIdx: index('books_source_submission_id_idx').on(t.sourceSubmissionId),
  // Partial unique index (source_submission_id IS NOT NULL) is created in the SQL migration directly,
  // since drizzle-orm's typed builder does not expose a partial-where helper on uniqueIndex in this version.
  canonicalKeyIdx: index('books_canonical_key_idx').on(t.canonicalKey),
  sortOrderIdx: index('books_sort_order_idx').on(t.sortOrder),
}))

export const legacyBookMappings = pgTable('legacy_book_mappings', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  legacySource: text('legacy_source').notNull(), // 'sheets' | 'submission' | 'book_name'
  legacyId: text('legacy_id').notNull(),
  legacyTitle: text('legacy_title'),
  legacyAuthor: text('legacy_author'),
  bookId: text('book_id').references(() => books.id, { onDelete: 'set null' }),
  confidence: text('confidence').notNull(), // 'exact' | 'normalized' | 'manual' | 'unmatched'
  resolution: text('resolution'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  legacyLookupIdx: uniqueIndex('legacy_book_mappings_source_id_idx').on(t.legacySource, t.legacyId),
  bookIdIdx: index('legacy_book_mappings_book_id_idx').on(t.bookId),
}))

export const tagDescriptions = pgTable('tag_descriptions', {
  tag: text('tag').primaryKey(),
  description: text('description').notNull(),
})

export const bookSubmissions = pgTable('book_submissions', {
  id:            text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId:        text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  bookId:        text('book_id').references(() => books.id, { onDelete: 'set null' }),
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
  bookIdIdx: index('book_submissions_book_id_idx').on(t.bookId),
}))

export const bookPriorities = pgTable('book_priorities', {
  userId:    text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  bookId:    text('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),
  rank:      integer('rank').notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.bookId] }),
}))

export const signupBooks = pgTable('signup_books', {
  userId:   text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  bookId:   text('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),
  signedAt: timestamp('signed_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.bookId] }),
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
