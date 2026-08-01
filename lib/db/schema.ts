import { sql } from 'drizzle-orm'
import {
  pgTable, text, timestamp, integer, boolean, primaryKey, foreignKey, index, uniqueIndex, jsonb, check,
  doublePrecision,
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
  slug: text('slug'),
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
  slugUnique: uniqueIndex('books_slug_unique').on(t.slug),
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

export const bookSummaries = pgTable('book_summaries', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bookId: text('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),
  authorUserId: text('author_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull(),
  title: text('title').notNull().default(''),
  tldr: text('tldr').notNull().default(''),
  bodyMarkdown: text('body_markdown').notNull().default(''),
  status: text('status').notNull().default('draft'),
  rejectionReason: text('rejection_reason'),
  submittedAt: timestamp('submitted_at', { mode: 'date' }),
  publishedAt: timestamp('published_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  bookAuthorUnique: uniqueIndex('book_summaries_book_author_unique').on(t.bookId, t.authorUserId),
  bookStatusIdx: index('book_summaries_book_status_idx').on(t.bookId, t.status),
  authorStatusIdx: index('book_summaries_author_status_idx').on(t.authorUserId, t.status),
}))

export const bookSummaryRevisions = pgTable('book_summary_revisions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  summaryId: text('summary_id').notNull().references(() => bookSummaries.id, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull(),
  title: text('title').notNull(),
  tldr: text('tldr').notNull(),
  bodyMarkdown: text('body_markdown').notNull(),
  status: text('status').notNull().default('draft'),
  rejectionReason: text('rejection_reason'),
  submittedAt: timestamp('submitted_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  summaryUnique: uniqueIndex('book_summary_revisions_summary_unique').on(t.summaryId),
  statusIdx: index('book_summary_revisions_status_idx').on(t.status),
}))

export const bookSummaryHelpfulReactions = pgTable('book_summary_helpful_reactions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  summaryId: text('summary_id').notNull().references(() => bookSummaries.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  visitorHash: text('visitor_hash'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  actorCheck: check(
    'book_summary_helpful_reactions_actor_check',
    sql`num_nonnulls(${t.userId}, ${t.visitorHash}) = 1`,
  ),
  summaryUserUnique: uniqueIndex('book_summary_helpful_reactions_summary_user_unique')
    .on(t.summaryId, t.userId)
    .where(sql`${t.userId} IS NOT NULL`),
  summaryVisitorUnique: uniqueIndex('book_summary_helpful_reactions_summary_visitor_unique')
    .on(t.summaryId, t.visitorHash)
    .where(sql`${t.visitorHash} IS NOT NULL`),
}))

export const bookPriorities = pgTable('book_priorities', {
  userId:     text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  bookId:     text('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),
  rank:       integer('rank').notNull(),
  rankSource: text('rank_source').$type<'auto' | 'manual'>().notNull().default('auto'),
  updatedAt:  timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.bookId] }),
}))

export const signupBooks = pgTable('signup_books', {
  userId:         text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  bookId:         text('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),
  signedAt:       timestamp('signed_at', { mode: 'date' }).notNull().defaultNow(),
  personalStatus: text('personal_status'), // null | 'reading' | 'read'
  personalStatusUpdatedAt: timestamp('personal_status_updated_at', { mode: 'date', withTimezone: true }),
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

// Используется для bot-login (deep-link через Telegram-бота, spec 2026-06-15): одноразовый токен входа.
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

export const telegramLoginFailures = pgTable('telegram_login_failures', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  reason: text('reason').notNull(),
  skewSeconds: integer('skew_seconds'),
  tgId: text('tg_id'),
  tgUsername: text('tg_username'),
  hasHash: boolean('has_hash').notNull(),
  ip: text('ip'),
}, (t) => ({
  createdAtIdx: index('telegram_login_failures_created_at_idx').on(t.createdAt),
}))

// Group Matching Mode tables — see docs/planning-artifacts/group-matching-mode-plan.md

export const matchingSessions = pgTable('matching_sessions', {
  id:                 text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name:               text('name').notNull(),
  createdBy:          text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt:          timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  deadlineAt:         timestamp('deadline_at', { mode: 'date' }),
  status:             text('status').notNull().default('active'), // 'active' | 'frozen'
  minGroupSize:       integer('min_group_size').notNull().default(3),
  maxGroupSize:       integer('max_group_size').notNull().default(3),
  stateVersion:       integer('state_version').notNull().default(0),
  bookModeInitializedAt:           timestamp('book_mode_initialized_at', { mode: 'date' }),
  frozenAt:                        timestamp('frozen_at', { mode: 'date' }),
  frozenScenarioJson:              jsonb('frozen_scenario_json'),
}, (t) => ({
  // During the lifecycle rollout both the legacy `active` and canonical `open`
  // values mean writable/current. The shared index prevents one of each.
  singleActiveIdx: uniqueIndex('matching_sessions_single_active_idx')
    .on(sql`(true)`)
    .where(sql`${t.status} IN ('active', 'open')`),
  statusCheck: check(
    'matching_sessions_status_check',
    sql`${t.status} IN ('active', 'frozen', 'open', 'closed')`,
  ),
  bookModeLifecycleCheck: check(
    'matching_sessions_book_mode_lifecycle_check',
    sql`${t.bookModeInitializedAt} IS NULL OR ${t.status} IN ('open', 'closed')`,
  ),
}))

export const matchingSessionParticipants = pgTable('matching_session_participants', {
  sessionId: text('session_id').notNull().references(() => matchingSessions.id, { onDelete: 'cascade' }),
  userId:    text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  publicRef: text('public_ref').notNull().$defaultFn(() => crypto.randomUUID()),
  joinSource: text('join_source').notNull().default('self'), // 'self' | 'admin'
  joinedAt:  timestamp('joined_at', { mode: 'date' }).notNull().defaultNow(),
  // Heartbeat присутствия (#338): обновляется при опросе /api/matching/version.
  // Телеметрия — audit_capture пропускает чисто last_seen_at-апдейты (миграция 0042).
  lastSeenAt: timestamp('last_seen_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.sessionId, t.userId] }),
  sessionPublicRefUniq: uniqueIndex('matching_session_participants_session_public_ref_idx').on(t.sessionId, t.publicRef),
  joinSourceCheck: check('matching_session_participants_join_source_check', sql`${t.joinSource} IN ('self', 'admin')`),
}))

export const matchingCircleConfirmations = pgTable('matching_circle_confirmations', {
  sessionId: text('session_id').notNull().references(() => matchingSessions.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  bookId: text('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),
  circleKey: text('circle_key').notNull(),
  memberUserIdsJson: jsonb('member_user_ids_json').$type<string[]>().notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({
    name: 'matching_circle_confirmations_session_user_pk',
    columns: [t.sessionId, t.userId],
  }),
  sessionCircleIdx: index('matching_circle_confirmations_session_circle_idx').on(t.sessionId, t.circleKey),
}))

export const matchingLockedCircles = pgTable('matching_locked_circles', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionId: text('session_id').notNull().references(() => matchingSessions.id, { onDelete: 'cascade' }),
  bookId: text('book_id').notNull().references(() => books.id, { onDelete: 'restrict' }),
  circleKey: text('circle_key').notNull(),
  status: text('status').notNull().default('locked'), // 'locked' | 'dissolved'
  lockedAt: timestamp('locked_at', { mode: 'date' }).notNull().defaultNow(),
  lockedStateVersion: integer('locked_state_version').notNull(),
  dissolvedAt: timestamp('dissolved_at', { mode: 'date' }),
  dissolvedBy: text('dissolved_by').references(() => users.id, { onDelete: 'set null' }),
  dissolveReason: text('dissolve_reason'),
}, (t) => ({
  activeCircleUniq: uniqueIndex('matching_locked_circles_active_circle_idx')
    .on(t.sessionId, t.circleKey)
    .where(sql`${t.status} = 'locked'`),
  sessionLockedAtIdx: index('matching_locked_circles_session_locked_at_idx').on(t.sessionId, t.lockedAt),
  statusCheck: check('matching_locked_circles_status_check', sql`${t.status} IN ('locked', 'dissolved')`),
}))

export const matchingLockedCircleMembers = pgTable('matching_locked_circle_members', {
  circleId: text('circle_id').notNull().references(() => matchingLockedCircles.id, { onDelete: 'cascade' }),
  sessionId: text('session_id').notNull().references(() => matchingSessions.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  displayNameSnapshot: text('display_name_snapshot').notNull(),
  releasedAt: timestamp('released_at', { mode: 'date' }),
}, (t) => ({
  pk: primaryKey({
    name: 'matching_locked_circle_members_circle_user_pk',
    columns: [t.circleId, t.userId],
  }),
  activeUserUniq: uniqueIndex('matching_locked_circle_members_active_user_idx')
    .on(t.sessionId, t.userId)
    .where(sql`${t.releasedAt} IS NULL`),
}))

export const matchingBookIntents = pgTable('matching_book_intents', {
  sessionId: text('session_id').notNull(),
  userId: text('user_id').notNull(),
  bookId: text('book_id').notNull().references(() => books.id, { onDelete: 'restrict' }),
  kind: text('kind').$type<'conditional' | 'hard'>().notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({
    name: 'matching_book_intents_session_user_book_pk',
    columns: [t.sessionId, t.userId, t.bookId],
  }),
  participantFk: foreignKey({
    name: 'matching_book_intents_session_user_fk',
    columns: [t.sessionId, t.userId],
    foreignColumns: [matchingSessionParticipants.sessionId, matchingSessionParticipants.userId],
  }).onDelete('cascade'),
  hardUserUniq: uniqueIndex('matching_book_intents_session_user_hard_uniq')
    .on(t.sessionId, t.userId)
    .where(sql`${t.kind} = 'hard'`),
  sessionBookKindCreatedIdx: index('matching_book_intents_session_book_kind_created_idx')
    .on(t.sessionId, t.bookId, t.kind, t.createdAt),
  kindCheck: check('matching_book_intents_kind_check', sql`${t.kind} IN ('conditional', 'hard')`),
}))

export const matchingSessionBookStates = pgTable('matching_session_book_states', {
  sessionId: text('session_id').notNull().references(() => matchingSessions.id, { onDelete: 'cascade' }),
  bookId: text('book_id').notNull().references(() => books.id, { onDelete: 'restrict' }),
  formedAt: timestamp('formed_at', { mode: 'date' }).notNull().defaultNow(),
  formedStateVersion: integer('formed_state_version').notNull(),
}, (t) => ({
  pk: primaryKey({
    name: 'matching_session_book_states_session_book_pk',
    columns: [t.sessionId, t.bookId],
  }),
  formedStateVersionCheck: check(
    'matching_session_book_states_formed_state_version_check',
    sql`${t.formedStateVersion} >= 0`,
  ),
}))

export const matchingCircles = pgTable('matching_circles', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionId: text('session_id').notNull().references(() => matchingSessions.id, { onDelete: 'cascade' }),
  bookId: text('book_id').notNull().references(() => books.id, { onDelete: 'restrict' }),
  position: integer('position').notNull(),
  legacyLockedCircleId: text('legacy_locked_circle_id')
    .references(() => matchingLockedCircles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  identityUniq: uniqueIndex('matching_circles_id_session_book_uniq').on(t.id, t.sessionId, t.bookId),
  sessionBookPositionUniq: uniqueIndex('matching_circles_session_book_position_uniq')
    .on(t.sessionId, t.bookId, t.position),
  legacyLockedCircleUniq: uniqueIndex('matching_circles_legacy_locked_circle_uniq')
    .on(t.legacyLockedCircleId),
  positionCheck: check('matching_circles_position_check', sql`${t.position} >= 1`),
}))

export const matchingBookAssignments = pgTable('matching_book_assignments', {
  sessionId: text('session_id').notNull(),
  userId: text('user_id').notNull(),
  bookId: text('book_id').notNull().references(() => books.id, { onDelete: 'restrict' }),
  source: text('source').$type<'hard' | 'conditional' | 'admin' | 'legacy'>().notNull(),
  assignedAt: timestamp('assigned_at', { mode: 'date' }).notNull().defaultNow(),
  assignedBy: text('assigned_by').references(() => users.id, { onDelete: 'set null' }),
  circleId: text('circle_id'),
}, (t) => ({
  pk: primaryKey({
    name: 'matching_book_assignments_session_user_pk',
    columns: [t.sessionId, t.userId],
  }),
  participantFk: foreignKey({
    name: 'matching_book_assignments_session_user_fk',
    columns: [t.sessionId, t.userId],
    foreignColumns: [matchingSessionParticipants.sessionId, matchingSessionParticipants.userId],
  }),
  sessionFk: foreignKey({
    name: 'matching_book_assignments_session_id_fk',
    columns: [t.sessionId],
    foreignColumns: [matchingSessions.id],
  }).onDelete('cascade'),
  circleFk: foreignKey({
    name: 'matching_book_assignments_circle_session_book_fk',
    columns: [t.circleId, t.sessionId, t.bookId],
    foreignColumns: [matchingCircles.id, matchingCircles.sessionId, matchingCircles.bookId],
  }),
  sessionBookAssignedIdx: index('matching_book_assignments_session_book_assigned_idx')
    .on(t.sessionId, t.bookId, t.assignedAt, t.userId),
  sourceCheck: check(
    'matching_book_assignments_source_check',
    sql`${t.source} IN ('hard', 'conditional', 'admin', 'legacy')`,
  ),
}))

export const matchingNotices = pgTable('matching_notices', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionId: text('session_id').notNull().references(() => matchingSessions.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  readAt: timestamp('read_at', { mode: 'date' }),
}, (t) => ({
  unreadIdx: index('matching_notices_session_user_unread_idx').on(t.sessionId, t.userId, t.readAt),
}))

export const matchingEvents = pgTable('matching_events', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionId: text('session_id').notNull().references(() => matchingSessions.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(),
  actorUserId: text('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  actorNameSnapshot: text('actor_name_snapshot'),
  subjectUserId: text('subject_user_id').references(() => users.id, { onDelete: 'set null' }),
  subjectNameSnapshot: text('subject_name_snapshot'),
  source: text('source').notNull(),
  bookId: text('book_id').references(() => books.id, { onDelete: 'set null' }),
  before: jsonb('before'),
  after: jsonb('after'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  stateVersion: integer('state_version').notNull(),
  occurredAt: timestamp('occurred_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  sessionOccurredAtIdx: index('matching_events_session_occurred_at_idx').on(t.sessionId, t.occurredAt),
  subjectOccurredAtIdx: index('matching_events_subject_occurred_at_idx').on(t.subjectUserId, t.occurredAt),
  typeOccurredAtIdx: index('matching_events_type_occurred_at_idx').on(t.eventType, t.occurredAt),
}))

export const userMergeEvents = pgTable('user_merge_events', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  occurredAt: timestamp('occurred_at', { mode: 'date' }).notNull().defaultNow(),
  actorUserId: text('actor_user_id'),
  sourceUserId: text('source_user_id').notNull(),
  targetUserId: text('target_user_id').notNull(),
  reason: text('reason').notNull(),
  sourceSnapshot: jsonb('source_snapshot').notNull(),
  targetSnapshot: jsonb('target_snapshot').notNull(),
  movedCounts: jsonb('moved_counts').$type<Record<string, number>>().notNull(),
}, (t) => ({
  occurredAtIdx: index('user_merge_events_occurred_at_idx').on(t.occurredAt),
  targetUserIdx: index('user_merge_events_target_user_id_idx').on(t.targetUserId, t.occurredAt),
  sourceUserIdx: index('user_merge_events_source_user_id_idx').on(t.sourceUserId, t.occurredAt),
}))

// Site-wide audit log — см. docs/superpowers/specs/2026-06-10-site-audit-log-design.md
// Захват делают триггеры БД (drizzle/00YY_audit_triggers.sql), не drizzle-код.
export const auditLog = pgTable('audit_log', {
  id:            text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  occurredAt:    timestamp('occurred_at', { mode: 'date' }).notNull().defaultNow(),
  // БЕЗ FK на users: append-only журнал не должен мутироваться каскадом ON DELETE.
  // «Кто» сохраняется денормализованно в actorLabel; actorUserId — просто текстовый id.
  actorUserId:   text('actor_user_id'),
  actorLabel:    text('actor_label'),
  source:        text('source').notNull(),
  action:        text('action').notNull(),
  entityType:    text('entity_type').notNull(),
  entityId:      text('entity_id'),
  before:        jsonb('before'),
  after:         jsonb('after'),
  changedFields: jsonb('changed_fields').$type<string[]>(),
  reason:        text('reason'),
  metadata:      jsonb('metadata'),
}, (t) => ({
  entityIdx: index('audit_log_entity_idx').on(t.entityType, t.entityId, t.occurredAt),
  actorIdx:  index('audit_log_actor_idx').on(t.actorUserId, t.occurredAt),
  timeIdx:   index('audit_log_occurred_at_idx').on(t.occurredAt),
}))

// ---------------------------------------------------------------------------
// Timeline (раздел «Лента времени»). Данные перенесены из локального SQLite,
// подробности — docs/features/timeline.md.
// ---------------------------------------------------------------------------

export const historicalEventTypes = pgTable('historical_event_types', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  color: text('color').notNull(),
  icon: text('icon').notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  titleLowerUnique: uniqueIndex('historical_event_types_title_lower_idx').on(sql`lower(${t.title})`),
}))

export const historicalEvents = pgTable('historical_events', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  eventTypeId: text('event_type_id').notNull()
    .references(() => historicalEventTypes.id, { onDelete: 'restrict' }),
  startYear: integer('start_year').notNull(),
  startEra: text('start_era').notNull(),
  startMonth: integer('start_month'),
  startDay: integer('start_day'),
  endYear: integer('end_year'),
  endEra: text('end_era'),
  endMonth: integer('end_month'),
  endDay: integer('end_day'),
  ongoing: boolean('ongoing').notNull().default(false),
  description: text('description').notNull().default(''),
  imageUrl: text('image_url'),
  imageCaption: text('image_caption'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  titleIdx: index('historical_events_title_idx').on(t.title),
  typeIdx: index('historical_events_type_idx').on(t.eventTypeId),
}))

export const historicalEpochs = pgTable('historical_epochs', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  startYear: integer('start_year').notNull(),
  startEra: text('start_era').notNull(),
  startMonth: integer('start_month'),
  startDay: integer('start_day'),
  endYear: integer('end_year').notNull(),
  endEra: text('end_era').notNull(),
  endMonth: integer('end_month'),
  endDay: integer('end_day'),
  description: text('description').notNull().default(''),
  imageUrl: text('image_url'),
  imageCaption: text('image_caption'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  titleIdx: index('historical_epochs_title_idx').on(t.title),
}))

export const timelines = pgTable('timelines', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  published: boolean('published').notNull().default(false),
  viewportStart: doublePrecision('viewport_start'),
  viewportEnd: doublePrecision('viewport_end'),
  filterTypeIds: jsonb('filter_type_ids').$type<string[]>().notNull().default([]),
  epochsVisible: boolean('epochs_visible').notNull().default(true),
  showAll: boolean('show_all').notNull().default(false),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  slugUnique: uniqueIndex('timelines_slug_unique').on(t.slug),
  publishedIdx: index('timelines_published_idx').on(t.published),
}))

export const timelineEvents = pgTable('timeline_events', {
  timelineId: text('timeline_id').notNull()
    .references(() => timelines.id, { onDelete: 'cascade' }),
  eventId: text('event_id').notNull()
    .references(() => historicalEvents.id, { onDelete: 'cascade' }),
  note: text('note').notNull().default(''),
  visible: boolean('visible').notNull().default(true),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.timelineId, t.eventId] }),
  eventIdx: index('timeline_events_event_idx').on(t.eventId),
}))

export const timelineEpochs = pgTable('timeline_epochs', {
  timelineId: text('timeline_id').notNull()
    .references(() => timelines.id, { onDelete: 'cascade' }),
  epochId: text('epoch_id').notNull()
    .references(() => historicalEpochs.id, { onDelete: 'cascade' }),
  note: text('note').notNull().default(''),
  color: text('color').notNull(),
  visible: boolean('visible').notNull().default(true),
  pinnedLane: integer('pinned_lane'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.timelineId, t.epochId] }),
  epochIdx: index('timeline_epochs_epoch_idx').on(t.epochId),
}))
