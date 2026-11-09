import { revalidateTag } from 'next/cache'

/**
 * Метка кэша общих (не персональных) данных главной: каталог, теги, интро,
 * открытая сессия подбора, подборки. Сбрасывается после КАЖДОЙ успешной
 * мутации через withAuditContext — так не нужно помнить про сброс в каждом
 * из десятков мутирующих роутов. Подробности: docs/features/home-cache.md.
 */
export const HOME_PUBLIC_TAG = 'home-public'

/**
 * Помечает кэш главной устаревшим. Вне запроса Next.js (скрипты, Jest)
 * revalidateTag бросает исключение — там кэша нет, сбрасывать нечего.
 */
export function invalidateHomePublicCache(): void {
  try {
    revalidateTag(HOME_PUBLIC_TAG)
  } catch {
    // вне контекста запроса Next.js — ничего не делаем
  }
}
