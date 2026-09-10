/**
 * Решает, показывать ли на главной полосу входа в матчинг, и для какой сессии.
 *
 * Возвращает id открытой сессии, если полосу нужно показать, иначе `null`.
 * Клиенту id нужен для закрытия крестиком: cookie хранит именно его, а не флаг,
 * поэтому закрытие действует до конца текущего подбора и не отнимает у человека
 * единственный вход в следующем сезоне.
 *
 * Признак входа берётся только из `auth()`. Дополнительно проверять сессионную
 * cookie незачем: без неё `auth()` пользователя не вернёт, а если бы вернул —
 * гостю показались бы и его имя в шапке, и админские ссылки, и это была бы
 * проблема аутентификации всего сайта, а не одной полосы.
 */
export function resolveMatchingStripSessionId(input: {
  viewerUserId: string | null | undefined
  openSessionId: string | null | undefined
  dismissedSessionId: string | null | undefined
}): string | null {
  if (!input.viewerUserId || !input.openSessionId) return null
  return input.openSessionId === input.dismissedSessionId ? null : input.openSessionId
}
