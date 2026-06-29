// Единый источник правды: какие таблицы под аудитом.
// Новая мутабельная таблица → добавить сюда + триггер в миграции (см. CLAUDE.md).
// `audit_log` сюда НЕ входит — иначе триггер логировал бы собственные вставки (рекурсия).
// `telegram_login_failures` сюда НЕ входит намеренно: это диагностический/security-
// журнал анонимных неудачных входов (без actor). Аудит дал бы шум в audit_log и вектор
// флуда при переборе. Сам журнал и есть durable-хранилище. (НЕ «забыли обернуть».)
export const AUDITED_TABLES = [
  'books',
  'user',
  'book_priorities',
  'book_submissions',
  'book_summaries',
  'book_summary_revisions',
  'book_summary_helpful_reactions',
  'intro_sections',
  'signup_books',
  'feedback',
  'tag_descriptions',
  'matching_sessions',
  'matching_session_participants',
  'matching_pseudonym_reservations',
  'matching_preference_events',
  'user_merge_events',
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

// Таблицы, где source='trigger' ОЖИДАЕМ (системная автоматика / пишется не нашим кодом).
// Просмотрщик показывает для них «система», а не тревожное «внесистемное».
export const SYSTEM_TRIGGER_TABLES = [
  'verificationToken', 'user', 'user_identities',
  'notification_queue', 'matching_pseudonym_reservations',
] as const
