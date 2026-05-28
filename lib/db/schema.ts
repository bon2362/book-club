import { sql } from 'drizzle-orm'
import {
  pgTable, text, timestamp, integer, boolean, primaryKey, index, uniqueIndex, jsonb, real,
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
}, (t) => ({
  contactEmailLowerUnique: uniqueIndex('user_contact_email_lower_idx')
    .on(sql`lower(${t.contactEmail})`)
    .where(sql`${t.contactEmail} IS NOT NULL`),
}))

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
  emailLowerIdx: index('user_identities_email_lower_idx')
    .on(sql`lower(${t.email})`)
    .where(sql`${t.email} IS NOT NULL`),
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
  title: text('title').notNull(),
  author: text('author').notNull().default(''),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  type: text('type').notNull().default('book'), // 'book' | 'article'
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
  source: text('source').notNull().default('admin'), // 'admin' | 'submission'
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  publishedAt: timestamp('published_at', { mode: 'date' }),
  hiddenAt: timestamp('hidden_at', { mode: 'date' }),
}, (t) => ({
  visibilityIdx: index('books_visibility_idx').on(t.visibility),
  sortOrderIdx: index('books_sort_order_idx').on(t.sortOrder),
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

// Group Matching Mode tables — see docs/planning-artifacts/group-matching-mode-plan.md

export const matchingSessions = pgTable('matching_sessions', {
  id:                 text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name:               text('name').notNull(),
  createdBy:          text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt:          timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  deadlineAt:         timestamp('deadline_at', { mode: 'date' }),
  status:             text('status').notNull().default('active'), // 'active' | 'frozen'
  targetGroupSize:    integer('target_group_size').notNull().default(3),
  frozenAt:                        timestamp('frozen_at', { mode: 'date' }),
  frozenScenarioJson:              jsonb('frozen_scenario_json'),
  metricGroupsCount:               integer('metric_groups_count'),
  metricCoverage:                  integer('metric_coverage'),
  metricTimeToFreezeSeconds:       integer('metric_time_to_freeze_seconds'),
  metricTimeSinceLastMutationSeconds: integer('metric_time_since_last_mutation_seconds'),
  metricTop3HitRate:               real('metric_top3_hit_rate'),
}, (t) => ({
  // Enforces at most one active session at a time
  singleActiveIdx: uniqueIndex('matching_sessions_single_active_idx')
    .on(t.status)
    .where(sql`${t.status} = 'active'`),
}))

export const matchingSessionParticipants = pgTable('matching_session_participants', {
  sessionId: text('session_id').notNull().references(() => matchingSessions.id, { onDelete: 'cascade' }),
  userId:    text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  pseudonym: text('pseudonym').notNull(),
  joinedAt:  timestamp('joined_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  pk:                primaryKey({ columns: [t.sessionId, t.userId] }),
  sessionPseudoUniq: uniqueIndex('matching_session_participants_session_pseudo_idx').on(t.sessionId, t.pseudonym),
}))

export const adminViews = pgTable('admin_views', {
  id:           text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  adminId:      text('admin_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  viewedUserId: text('viewed_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sessionId:    text('session_id').references(() => matchingSessions.id, { onDelete: 'cascade' }),
  ts:           timestamp('ts', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  adminIdIdx: index('admin_views_admin_id_idx').on(t.adminId),
  tsIdx:      index('admin_views_ts_idx').on(t.ts),
}))
