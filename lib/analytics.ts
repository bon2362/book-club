import posthog from 'posthog-js'

type EventProps = Record<string, string | number | boolean | undefined | null | string[]>

let initialized = false
let currentIdentity: string | null = null
let pendingPageviewUrl: string | null = null
let pendingSince = 0
let visibilityListenerAttached = false
let pageviewSent = false
const SENSITIVE_QUERY_KEYS = new Set(['token', 'uid', 'ts', 'username', 'preauth', 'email'])
const LAST_IDENTITY_STORAGE_KEY = 'bc_last_identity'

type StoredIdentity = {
  userId: string
  provider: string | null
}

export function initPostHog(): void {
  if (initialized || typeof window === 'undefined') return
  if (process.env.NEXT_PUBLIC_DISABLE_ANALYTICS === 'true') return
  const key = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
  if (!key) return
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com',
    capture_pageview: false,
    capture_pageleave: true,
    person_profiles: 'identified_only',
    respect_dnt: true,
    advanced_disable_flags: true,
    // No session replay: the project owner explicitly opted out (too sensitive).
    capture_exceptions: true,
    // Уход со страницы без просмотра — это вкладка, которую так и не открыли
    // (просмотр придержан в capturePageview и не отправлен). Такой $pageleave
    // в одиночку делает из фоновой вкладки «посетителя»: за 90 дней с него
    // начиналась каждая шестая сессия.
    before_send: (event) => {
      if (event?.event === '$pageleave' && !pageviewSent) return null
      return event
    },
  })
  initialized = true
}

export function isPostHogReady(): boolean {
  return initialized
}

/**
 * Инициализирует PostHog по требованию. `initPostHog()` вызывается в эффекте
 * `PostHogProvider`, а React запускает эффекты вложенных компонентов РАНЬШЕ эффекта
 * родителя. Без этого события, отправленные сразу при показе экрана, тихо терялись:
 * `matching_welcome_shown` не пришёл ни разу за всё время, хотя экран видели все,
 * кто вступил в матчинг.
 */
function ensureInitialized(): boolean {
  if (typeof window === 'undefined') return false
  initPostHog()
  return initialized
}

export function track(event: string, properties?: EventProps): void {
  if (!ensureInitialized()) return
  posthog.capture(event, properties)
}

/**
 * Просмотр страницы. Если в момент загрузки вкладка скрыта, событие придерживается
 * до момента, когда человек её действительно откроет; не откроет — не отправится вовсе.
 *
 * Зачем. iOS выгружает фоновые вкладки из памяти и перезагружает их при возврате в
 * браузер. Такая перезагрузка слала просмотр, которого никто не видел: одна забытая
 * вкладка в инкогнито дала около 550 «посетителей» за полгода (разбор — в Wiki,
 * Analytics-and-PostHog). То же самое закрывает предзагрузку страниц браузером.
 */
export function capturePageview(url: string): void {
  if (!ensureInitialized()) return
  const sanitized = sanitizeAnalyticsUrl(url)
  if (!isPageHidden()) {
    pageviewSent = true
    posthog.capture('$pageview', { $current_url: sanitized })
    return
  }
  // Пока вкладка скрыта, помним только последний адрес: человек увидит именно его.
  pendingPageviewUrl = sanitized
  if (pendingSince === 0) pendingSince = Date.now()
  attachVisibilityListener()
}

function isPageHidden(): boolean {
  if (typeof document === 'undefined') return false
  // Предзагрузка браузером: страница отрисована, но её ещё никому не показали.
  if ((document as Document & { prerendering?: boolean }).prerendering === true) return true
  return document.visibilityState === 'hidden'
}

function attachVisibilityListener(): void {
  if (visibilityListenerAttached) return
  visibilityListenerAttached = true
  document.addEventListener('visibilitychange', flushPendingPageview)
  document.addEventListener('prerenderingchange', flushPendingPageview)
}

function detachVisibilityListener(): void {
  visibilityListenerAttached = false
  document.removeEventListener('visibilitychange', flushPendingPageview)
  document.removeEventListener('prerenderingchange', flushPendingPageview)
}

function flushPendingPageview(): void {
  if (isPageHidden()) return
  const url = pendingPageviewUrl
  const waitedMs = pendingSince === 0 ? 0 : Date.now() - pendingSince
  pendingPageviewUrl = null
  pendingSince = 0
  detachVisibilityListener()
  if (!url) return
  pageviewSent = true
  // deferred_ms — сколько страница пролежала скрытой. По нему видно, как часто
  // просмотры приходят из фоновых вкладок, а не из живых открытий.
  posthog.capture('$pageview', { $current_url: url, deferred_ms: waitedMs })
}

export function sanitizeAnalyticsUrl(url: string): string {
  try {
    const parsed = new URL(url)
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) parsed.searchParams.delete(key)
    }
    const query = parsed.searchParams.toString()
    return `${parsed.origin}${parsed.pathname}${query ? `?${query}` : ''}${parsed.hash}`
  } catch {
    return url
  }
}

function readStoredIdentity(): StoredIdentity | null {
  try {
    const raw = window.localStorage.getItem(LAST_IDENTITY_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.userId === 'string') {
      return { userId: parsed.userId, provider: typeof parsed.provider === 'string' ? parsed.provider : null }
    }
    return null
  } catch {
    return null
  }
}

function writeStoredIdentity(identity: StoredIdentity): void {
  try {
    window.localStorage.setItem(LAST_IDENTITY_STORAGE_KEY, JSON.stringify(identity))
  } catch {
    // localStorage unavailable (private mode, blockers) — detector silently degrades
  }
}

export function identifyUser(userId: string, provider?: string | null): void {
  if (!ensureInitialized()) return

  const normalizedProvider = provider ?? null
  const previous = readStoredIdentity()
  if (previous && previous.userId !== userId) {
    posthog.capture('account_duplicate_suspected', {
      previous_user_id: previous.userId,
      new_user_id: userId,
      previous_provider: previous.provider,
      new_provider: normalizedProvider,
    })
  }
  writeStoredIdentity({ userId, provider: normalizedProvider })

  if (currentIdentity === userId) return
  posthog.identify(userId)
  currentIdentity = userId
}

export function resetIdentity(): void {
  if (typeof window === 'undefined' || !initialized) return
  if (currentIdentity === null) return
  posthog.reset()
  currentIdentity = null
}

export function __resetForTesting(): void {
  initialized = false
  currentIdentity = null
  pendingPageviewUrl = null
  pendingSince = 0
  pageviewSent = false
  if (typeof document !== 'undefined' && visibilityListenerAttached) detachVisibilityListener()
  visibilityListenerAttached = false
}
