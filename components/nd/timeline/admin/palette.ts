/**
 * Палитра для типов событий и эпох.
 *
 * Почему здесь допустим сырой hex, хотя правило проекта его запрещает: это не
 * оформление интерфейса, а **данные**. Выбранное значение уезжает в колонку
 * `historical_event_types.color` и возвращается оттуда как строка, которую
 * рисует публичная лента. Токен `var(--…)` в базу положить нельзя — на сервере
 * его некому раскрыть.
 *
 * Проверка `scripts/check-no-raw-hex.sh` ищет hex внутри `style={{…}}` и в
 * Tailwind-классах с произвольным значением. Массив констант под неё не
 * попадает — и по сути правило не нарушено: в разметке цвета по-прежнему нет.
 *
 * Значения зеркалят токены `--data-*` и `--tint-*` из `app/globals.css`.
 */

export interface PaletteColor {
  value: string
  label: string
}

export const TIMELINE_PALETTE: PaletteColor[] = [
  { value: '#B0603C', label: 'Терракота' },
  { value: '#5D7290', label: 'Сланец' },
  { value: '#57795F', label: 'Шалфей' },
  { value: '#7A5E86', label: 'Слива' },
  { value: '#8A6B3A', label: 'Охра' },
]

export const DEFAULT_TIMELINE_COLOR = TIMELINE_PALETTE[0].value

export const TIMELINE_EPOCH_PALETTE: PaletteColor[] = [
  { value: '#EFE4D6', label: 'Песок' },
  { value: '#EADFCB', label: 'Светлая охра' },
  { value: '#E1E3D2', label: 'Светлый шалфей' },
  { value: '#DCE2E4', label: 'Светлый сланец' },
  { value: '#E9DCDC', label: 'Пыльная роза' },
  { value: '#E3DCE6', label: 'Светлая слива' },
]

export const DEFAULT_TIMELINE_EPOCH_COLOR = TIMELINE_EPOCH_PALETTE[0].value
