import { useEffect, useRef } from 'react'

/**
 * Скрывает элемент через `delayMs` после того, как он стал видимым.
 *
 * - `paused` останавливает таймер (например, на hover); снятие паузы
 *   запускает отсчёт заново с полного `delayMs`.
 * - `onDismiss` хранится в ref, поэтому смена идентичности колбэка между
 *   ре-рендерами НЕ перезапускает таймер — отсчёт зависит только от
 *   `visible`, `paused` и `delayMs`. Это сохраняет поведение исходного
 *   inline-useEffect в BooksPage.
 * - cleanup гарантирует, что таймер не утечёт между ре-рендерами.
 *
 * Логика таймера вынесена сюда из BooksPage, чтобы покрыть её быстрым
 * unit-тестом с fake timers вместо медленных (20s+) Playwright-сценариев.
 */
export function useAutoDismiss(
  visible: boolean,
  paused: boolean,
  onDismiss: () => void,
  delayMs = 20000,
) {
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  useEffect(() => {
    if (!visible || paused) return
    const t = setTimeout(() => onDismissRef.current(), delayMs)
    return () => clearTimeout(t)
  }, [visible, paused, delayMs])
}
