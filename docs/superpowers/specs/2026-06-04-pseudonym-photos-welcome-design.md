# Фото вида на приветственном экране /matching

**Дата:** 2026-06-04
**Статус:** дизайн утверждён, готов к плану

## Цель

На приветственном экране `/matching` ([MatchingWelcome.tsx](../../../components/nd/MatchingWelcome.tsx))
вместо буквы-глифа показывать **реальную фотографию** соответствующего вида (Сова → фото совы,
Окунь → фото окуня). Внутри самой сессии (чипы, фид, сценарии) — буквы остаются как сейчас.

Смысл фичи: фотография сразу обращает внимание человека на то, что в сессии используются
**псевдонимы-животные**, а не настоящие имена.

## Ключевые решения (зафиксированы с пользователем)

| Вопрос | Решение |
|---|---|
| Гранулярность | Один вид = одна картинка (все 212 ников из `ANIMALS`) |
| Источник | Реальные фото с Wikimedia Commons |
| Лицензии | PD / CC0 / CC-BY / CC-BY-SA; атрибуция хранится и показывается |
| Хранение | Локально в `public/`, оптимизированные webp (~320px), коммитятся в репо |
| Обработка | Натуральный цвет (без grayscale) |
| Область | Только welcome-экран; внутри сессии — буквы |
| Фолбэк | Нет фото → текущая буква-глиф (П/В/Ж/З) |

## Архитектура

### 1. Конвейер сбора фото — `scripts/fetch-pseudonym-photos.ts`

Одноразовый/повторяемый Node-скрипт (`tsx`/`ts-node`), запускается **вручную** разработчиком.
В рантайме сайта к Wikimedia **не обращаемся**.

Для каждого ника из `ANIMALS` (`lib/matching/pseudonyms.ts`):

1. **Заглавное изображение.** Запрос к MediaWiki API ru.wikipedia:
   `action=query&prop=pageimages&piprop=original&titles=<ник>`. Берём имя файла оригинала.
2. **Метаданные лицензии.** Запрос к Commons API по файлу:
   `prop=imageinfo&iiprop=extmetadata|url` → читаем `extmetadata.LicenseShortName`,
   `extmetadata.Artist`, `extmetadata.LicenseUrl`, `extmetadata.Credit`.
3. **Фильтр лицензий.** Принимаем `PD / CC0 / CC-BY / CC-BY-SA` (любых версий).
   Режем `non-free`, `fair use`, отсутствие лицензии, нераспознанные строки.
4. **Скачивание + ресайз.** Качаем оригинал, `sharp` → квадрат ~320×320, `webp` (~q80),
   `cover`-кроп по центру. Сохраняем в `public/matching/species/<slug>.webp`.
5. **Slug.** Детерминированная транслитерация ника (`Сова` → `sova`, `Ёж` → `yozh`).
   Таблица транслитерации кириллицы в самом скрипте.
6. **Манифест.** Пишем `lib/matching/species-images.generated.ts`:
   ```ts
   export const SPECIES_PHOTOS: Record<string, {
     file: string      // '/matching/species/sova.webp'
     author: string    // из extmetadata.Artist (HTML-теги вычищены)
     license: string    // 'CC BY-SA 4.0'
     sourceUrl: string  // ссылка на страницу файла Commons
   }> = { /* ... */ }
   ```
   Ники, для которых фото не нашлось/не прошло фильтр, **в манифест не попадают**.

**Артефакты коммитятся:** `public/matching/species/*.webp` + сгенерированный манифест.
После прогона — ручная глазная проверка корректности фото (диалектные/неоднозначные ники
вроде «Отряд», «Бойник», «Северень», «Маралка» вероятно не зарезолвятся — это ок, у них фолбэк).

**Зависимости:** добавить `sharp` (и при необходимости `tsx`) в `devDependencies`.

### 2. Рантайм-хелпер + фолбэк — `lib/matching/pseudonym-illustrations.ts`

Рядом с существующими `getPseudonymIllustrationKind` / `getPseudonymIllustrationGlyph`:

```ts
import { SPECIES_PHOTOS } from './species-images.generated'
export interface PseudonymPhoto { file: string; author: string; license: string; sourceUrl: string }
export function getPseudonymPhoto(pseudonym: string): PseudonymPhoto | null {
  return SPECIES_PHOTOS[pseudonym] ?? null
}
```

Существующие хелперы глифов **не меняются** — буква остаётся гарантированным фолбэком.

### 3. Welcome-экран — `components/nd/MatchingWelcome.tsx`

Меняется только левая ячейка карточки-представления (сейчас grid `104px minmax(0,1fr)`,
рендерит глиф на строках 142–169). Логика входа в сессию, заголовки, кнопка — без изменений.

- `const photo = getPseudonymPhoto(pseudonym)`.
- **Есть фото:** `next/image` (`fill`, `objectFit: 'cover'`), острые углы (`var(--radius)` = 0),
  без тени, натуральный цвет. `onError` → фолбэк на букву (паттерн как в
  [CoverImage.tsx](../../../components/nd/CoverImage.tsx) с локальным `useState(imgError)`).
- **Нет фото или ошибка загрузки:** текущий рендер буквы-глифа (без изменений).
- Чтобы фото «цепляло взгляд», ячейку изображения делаем заметно крупнее текущих 104px
  (ориентир — квадрат ~132–160px или фото на всю ширину карточки сверху; точные значения —
  в плане реализации, в рамках канона).
- **Атрибуция:** под фото — микро-кредит `фото: <author> · <license>` стилем `microStyle`
  (0.6rem, uppercase, `var(--text-muted)`). Этого достаточно для CC-BY/CC-BY-SA.
  HTML из `author` уже вычищен на этапе скрипта; ссылка `sourceUrl` опционально оборачивает кредит.

### 4. Тесты

- **Unit** (`lib/matching/__tests__/`): `getPseudonymPhoto` возвращает запись для известного
  ника (из манифеста) и `null` для неизвестного. Так как манифест генерируется — тест берёт
  любой реально присутствующий ключ из `SPECIES_PHOTOS` + заведомо отсутствующий.
- **E2E** (`e2e/ui-states.spec.ts`): на welcome-экране для участника с ником, у которого есть
  фото, рендерится `<img>` в ячейке-иллюстрации; для ника без фото — буква-глиф.
  (Welcome-экран показывается участнику до входа в сессию — фикстура сессии + резервация ника.)

## Канон и ограничения (CLAUDE.md)

- Никаких сырых хексов — только `var(--…)`. Острые углы (radius 0). Без теней.
- Inline `style={{…}}` + `var(--…)` — канон проекта, используем его.
- `next.config` уже `images.unoptimized: true` + `remotePatterns: **` — локальные webp отдаются как есть.

## Влияние на Wiki / документацию

- **Wiki: нужна** — новая пользовательская деталь (`docs/wiki/`): на welcome-экране /matching
  показывается фото вида-псевдонима; источник — Wikimedia с атрибуцией; буква-фолбэк.
- `docs/features/` — при наличии раздела про matching обновить.

## Out of scope (YAGNI)

- Не трогаем отображение внутри сессии (буквы остаются).
- Не делаем grayscale/hover-эффекты.
- Не делаем рантайм-фетч из Wikimedia и админ-UI управления фото.
- Не делаем отдельную страницу credits — атрибуции под фото достаточно.
