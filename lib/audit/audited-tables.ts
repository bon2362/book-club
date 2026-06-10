// Единый источник правды: какие таблицы под аудитом.
// Новая мутабельная таблица → добавить сюда + триггер в миграции (см. CLAUDE.md).
// `audit_log` сюда НЕ входит — иначе триггер логировал бы собственные вставки (рекурсия).
export const AUDITED_TABLES = [
  'books',
  'user',
  'book_priorities',
  'book_submissions',
  'intro_sections',
  'signup_books',
  'feedback',
  'tag_descriptions',
  'matching_sessions',
  'matching_session_participants',
  'matching_pseudonym_reservations',
  'matching_preference_events',
  'user_activity_events',
  'user_identities',
  'verificationToken',
  'telegram_preauth_tokens',
  'notification_queue',
] as const

export type AuditedTable = (typeof AUDITED_TABLES)[number]

// Таблицы, для которых source='trigger' — НЕ сигнал «забыли обернуть»:
// их пишет NextAuth DrizzleAdapter / auth-цепочка мимо нашего кода (lib/auth.ts,
// lib/telegram-auth.ts, lib/user-identities.ts). Reconciliation-проверка их игнорирует.
export const AUTH_OOB_TABLES = ['verificationToken', 'user', 'user_identities'] as const
