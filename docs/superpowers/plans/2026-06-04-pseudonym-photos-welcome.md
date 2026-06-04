# Фото вида на приветственном экране /matching — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** На welcome-экране `/matching` показывать реальное фото вида-псевдонима (с Wikimedia, натуральный цвет, с атрибуцией); внутри сессии — буквы как сейчас; нет фото → буква-фолбэк.

**Architecture:** Одноразовый Node-скрипт тянет фото с Wikimedia по 212 никам, фильтрует лицензии (PD/CC0/CC-BY/CC-BY-SA), ресайзит в webp ~320px в `public/matching/species/`, пишет сгенерированный TS-манифест. Рантайм-хелпер читает манифест; `MatchingWelcome.tsx` рендерит фото или фолбэк-букву.

**Tech Stack:** Next.js 14, TypeScript, `sharp` (ресайз), `ts-node` (запуск скрипта), Jest + Testing Library (unit/компонентные тесты), Playwright (e2e).

**Спека:** [docs/superpowers/specs/2026-06-04-pseudonym-photos-welcome-design.md](../specs/2026-06-04-pseudonym-photos-welcome-design.md)

---

## File Structure

- **Create** `scripts/fetch-pseudonym-photos.ts` — конвейер сбора (Wikimedia → фильтр → ресайз → манифест). Запускается вручную.
- **Create** `public/matching/species/<slug>.webp` — оптимизированные фото (генерируются скриптом, коммитятся).
- **Create** `lib/matching/species-images.generated.ts` — манифест `SPECIES_PHOTOS` (генерируется скриптом, коммитится).
- **Modify** `lib/matching/pseudonym-illustrations.ts` — добавить `PseudonymPhoto` + `getPseudonymPhoto()`. Существующие хелперы глифов не трогать.
- **Create** `lib/matching/__tests__/pseudonym-illustrations.test.ts` — unit на `getPseudonymPhoto`.
- **Modify** `components/nd/MatchingWelcome.tsx` — левая ячейка карточки: фото или буква + микро-кредит.
- **Create** `components/nd/MatchingWelcome.test.tsx` — компонентный тест ветвления фото/буква.
- **Modify** `e2e/matching-reader-circles.spec.ts` — проверка, что в welcome-карточке рендерится иллюстрация (img или глиф).
- **Modify** `package.json` — `sharp` в devDependencies.
- **Modify** `docs/wiki/` + `docs/features/` — описание фичи.

---

## Task 1: Скрипт сбора фото

**Files:**
- Create: `scripts/fetch-pseudonym-photos.ts`
- Modify: `package.json` (devDependencies: `sharp`)

- [ ] **Step 1: Установить sharp**

Run:
```bash
npm install --save-dev sharp
```
Expected: `sharp` появляется в `devDependencies`, `package-lock.json` обновлён.

- [ ] **Step 2: Написать скрипт**

Create `scripts/fetch-pseudonym-photos.ts`:

```ts
/* eslint-disable no-console */
/**
 * Тянет по одному фото на каждый ник из ANIMALS с Wikimedia, фильтрует лицензии
 * (PD/CC0/CC-BY/CC-BY-SA), ресайзит в webp 320x320 в public/matching/species/,
 * пишет манифест lib/matching/species-images.generated.ts.
 *
 *   npx ts-node --transpile-only -P tsconfig.scripts.json scripts/fetch-pseudonym-photos.ts
 *
 * Запускается вручную. Артефакты (webp + манифест) коммитятся в репо.
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { ANIMALS } from '../lib/matching/pseudonyms'

const OUT_DIR = path.resolve(__dirname, '..', 'public', 'matching', 'species')
const MANIFEST = path.resolve(__dirname, '..', 'lib', 'matching', 'species-images.generated.ts')
const WIKI_API = 'https://ru.wikipedia.org/w/api.php'
const UA = 'slowreading.club pseudonym-photo-fetch/1.0 (bon2362@gmail.com)'

const TRANSLIT: Record<string, string> = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'y',к:'k',
  л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',
  ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
}

function slugify(name: string): string {
  return name.toLowerCase().split('').map((c) => TRANSLIT[c] ?? '').join('')
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

const ACCEPT = /^(cc0|public domain|cc by)/i // покрывает CC0, Public domain, CC BY, CC BY-SA

interface ManifestEntry { file: string; author: string; license: string; sourceUrl: string }

async function api(params: Record<string, string>): Promise<any> {
  const url = `${WIKI_API}?${new URLSearchParams({ ...params, format: 'json', origin: '*' })}`
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json()
}

async function resolve(name: string): Promise<(ManifestEntry & { thumbUrl: string }) | null> {
  // 1) заглавное изображение статьи
  const page = await api({ action: 'query', prop: 'pageimages', piprop: 'original', titles: name })
  const pages = page?.query?.pages ?? {}
  const first: any = Object.values(pages)[0]
  const fileTitle: string | undefined = first?.pageimage
  if (!fileTitle) return null

  // 2) лицензия + thumbnail по файлу
  const info = await api({
    action: 'query', prop: 'imageinfo', titles: `File:${fileTitle}`,
    iiprop: 'extmetadata|url', iiurlwidth: '640',
  })
  const ipages = info?.query?.pages ?? {}
  const ifirst: any = Object.values(ipages)[0]
  const ii = ifirst?.imageinfo?.[0]
  if (!ii) return null
  const meta = ii.extmetadata ?? {}
  const license = stripHtml(meta.LicenseShortName?.value ?? '')
  if (!ACCEPT.test(license)) return null
  const author = stripHtml(meta.Artist?.value ?? '') || 'Wikimedia Commons'
  const thumbUrl: string = ii.thumburl ?? ii.url
  if (!thumbUrl) return null

  return {
    thumbUrl,
    file: '', // заполнится после ресайза
    author,
    license,
    sourceUrl: ii.descriptionurl ?? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileTitle)}`,
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const manifest: Record<string, ManifestEntry> = {}
  const misses: string[] = []

  for (const name of ANIMALS) {
    try {
      const r = await resolve(name)
      if (!r) { misses.push(name); continue }
      const slug = slugify(name)
      const buf = Buffer.from(await (await fetch(r.thumbUrl, { headers: { 'User-Agent': UA } })).arrayBuffer())
      await sharp(buf).resize(320, 320, { fit: 'cover', position: 'centre' }).webp({ quality: 80 })
        .toFile(path.join(OUT_DIR, `${slug}.webp`))
      manifest[name] = { file: `/matching/species/${slug}.webp`, author: r.author, license: r.license, sourceUrl: r.sourceUrl }
      console.log(`OK  ${name} -> ${slug}.webp [${r.license}]`)
    } catch (e) {
      misses.push(name)
      console.warn(`SKIP ${name}: ${(e as Error).message}`)
    }
    await new Promise((res) => setTimeout(res, 200)) // вежливый rate-limit
  }

  const body =
    `// AUTO-GENERATED by scripts/fetch-pseudonym-photos.ts — do not edit by hand.\n` +
    `export interface PseudonymPhoto { file: string; author: string; license: string; sourceUrl: string }\n` +
    `export const SPECIES_PHOTOS: Record<string, PseudonymPhoto> = ${JSON.stringify(manifest, null, 2)}\n`
  fs.writeFileSync(MANIFEST, body)
  console.log(`\nDone. ${Object.keys(manifest).length} photos, ${misses.length} misses:`, misses.join(', '))
}

main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 3: Проверить, что скрипт типизируется**

Run:
```bash
npx tsc --noEmit -p tsconfig.scripts.json
```
Expected: без ошибок (если `tsconfig.scripts.json` не включает `scripts/**`, временно проверить файл напрямую — `npx tsc --noEmit --transpile-only scripts/fetch-pseudonym-photos.ts` не сработает с импортами; достаточно прогона в Task 2).

- [ ] **Step 4: Commit**

```bash
git add scripts/fetch-pseudonym-photos.ts package.json package-lock.json
git commit -m "feat(matching): add pseudonym photo fetch script"
```

---

## Task 2: Прогон скрипта и генерация ассетов

**Files:**
- Create: `public/matching/species/*.webp` (генерируются)
- Create: `lib/matching/species-images.generated.ts` (генерируется)

- [ ] **Step 1: Запустить конвейер**

Run:
```bash
npx ts-node --transpile-only -P tsconfig.scripts.json scripts/fetch-pseudonym-photos.ts
```
Expected: в консоли строки `OK <ник>` и `SKIP <ник>`, в конце `Done. N photos, M misses`. Появляются `public/matching/species/*.webp` и `lib/matching/species-images.generated.ts`.

- [ ] **Step 2: Глазная проверка**

Открыть 8–10 случайных webp из `public/matching/species/` (напр. `sova.webp`, `okun.webp`, `shmel.webp`, `barsuk.webp`) и убедиться, что на фото действительно нужный вид. Открыть `lib/matching/species-images.generated.ts` и проверить, что у записей заполнены `author`/`license`/`sourceUrl`. Если конкретное фото явно неверное — удалить ключ из манифеста и соответствующий webp (этот ник уйдёт в фолбэк-букву).

- [ ] **Step 3: Убедиться, что манифест непустой**

Run:
```bash
grep -c '"file"' lib/matching/species-images.generated.ts
```
Expected: число > 0 (сколько ников получили фото). Если 0 — разобраться с API/сетью прежде чем продолжать.

- [ ] **Step 4: Commit**

```bash
git add public/matching/species lib/matching/species-images.generated.ts
git commit -m "feat(matching): generate pseudonym species photos and manifest"
```

---

## Task 3: Рантайм-хелпер getPseudonymPhoto (TDD)

**Files:**
- Modify: `lib/matching/pseudonym-illustrations.ts`
- Test: `lib/matching/__tests__/pseudonym-illustrations.test.ts`

- [ ] **Step 1: Написать падающий тест**

Create `lib/matching/__tests__/pseudonym-illustrations.test.ts`:

```ts
import { getPseudonymPhoto } from '../pseudonym-illustrations'
import { SPECIES_PHOTOS } from '../species-images.generated'

describe('getPseudonymPhoto', () => {
  it('возвращает запись для ника, у которого есть фото', () => {
    const keys = Object.keys(SPECIES_PHOTOS)
    expect(keys.length).toBeGreaterThan(0) // манифест должен быть сгенерирован
    const known = keys[0]
    const photo = getPseudonymPhoto(known)
    expect(photo).not.toBeNull()
    expect(photo!.file).toMatch(/^\/matching\/species\/.+\.webp$/)
    expect(photo!.license).toBeTruthy()
    expect(photo!.author).toBeTruthy()
  })

  it('возвращает null для неизвестного ника', () => {
    expect(getPseudonymPhoto('__нет-такого-вида__')).toBeNull()
  })
})
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run:
```bash
npx jest lib/matching/__tests__/pseudonym-illustrations.test.ts
```
Expected: FAIL — `getPseudonymPhoto is not a function` (хелпер ещё не экспортирован).

- [ ] **Step 3: Реализовать хелпер**

В `lib/matching/pseudonym-illustrations.ts` добавить в конец файла:

```ts
import { SPECIES_PHOTOS, type PseudonymPhoto } from './species-images.generated'

export type { PseudonymPhoto }

export function getPseudonymPhoto(pseudonym: string): PseudonymPhoto | null {
  return SPECIES_PHOTOS[pseudonym] ?? null
}
```

(Импорт можно поднять к верху файла, если так требует линт-правило `import/first`.)

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run:
```bash
npx jest lib/matching/__tests__/pseudonym-illustrations.test.ts
```
Expected: PASS (2 теста).

- [ ] **Step 5: Lint + typecheck**

Run:
```bash
npm run lint && npm run typecheck
```
Expected: без ошибок.

- [ ] **Step 6: Commit**

```bash
git add lib/matching/pseudonym-illustrations.ts lib/matching/__tests__/pseudonym-illustrations.test.ts
git commit -m "feat(matching): add getPseudonymPhoto manifest helper"
```

---

## Task 4: Welcome-экран — фото вместо буквы (TDD)

**Files:**
- Modify: `components/nd/MatchingWelcome.tsx`
- Test: `components/nd/MatchingWelcome.test.tsx`

- [ ] **Step 1: Написать падающий компонентный тест**

Create `components/nd/MatchingWelcome.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import MatchingWelcome from './MatchingWelcome'
import { SPECIES_PHOTOS } from '@/lib/matching/species-images.generated'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}))
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(props as Record<string, string>)} />
  },
}))

const withPhoto = Object.keys(SPECIES_PHOTOS)[0]

describe('MatchingWelcome иллюстрация ника', () => {
  it('рендерит фото для ника, у которого оно есть', () => {
    render(<MatchingWelcome sessionId="s1" sessionName="Тест" pseudonym={withPhoto} />)
    const img = screen.getByTestId('welcome-species-photo')
    expect(img).toBeInTheDocument()
    expect(img.getAttribute('src')).toContain(SPECIES_PHOTOS[withPhoto].file)
    expect(screen.getByText(/фото:/i)).toBeInTheDocument()
  })

  it('рендерит букву-глиф для ника без фото', () => {
    render(<MatchingWelcome sessionId="s1" sessionName="Тест" pseudonym="__нет-такого-вида__" />)
    expect(screen.queryByTestId('welcome-species-photo')).not.toBeInTheDocument()
    expect(screen.getByTestId('welcome-species-glyph')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run:
```bash
npx jest components/nd/MatchingWelcome.test.tsx
```
Expected: FAIL — нет элементов с testid `welcome-species-photo` / `welcome-species-glyph`.

- [ ] **Step 3: Реализовать в MatchingWelcome.tsx**

В `components/nd/MatchingWelcome.tsx`:

1. Добавить импорты в начало файла:
```tsx
import Image from 'next/image'
import { getPseudonymPhoto } from '@/lib/matching/pseudonym-illustrations'
```

2. После строки `const glyph = getPseudonymIllustrationGlyph(kind)` добавить:
```tsx
const photo = getPseudonymPhoto(pseudonym)
const [photoError, setPhotoError] = useState(false)
const showPhoto = photo !== null && !photoError
```

3. Заменить блок ячейки-иллюстрации (текущий `<div aria-label={`Иллюстрация ника ${pseudonym}`} ...>` со строками глифа) на:
```tsx
<div
  aria-label={`Иллюстрация ника ${pseudonym}`}
  style={{
    position: 'relative',
    minHeight: 132,
    borderRight: '1px solid var(--hair)',
    background: 'var(--bg-elevated)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    gap: '0.5rem',
    color: 'var(--accent)',
    overflow: 'hidden',
  }}
>
  {showPhoto ? (
    <Image
      data-testid="welcome-species-photo"
      src={photo!.file}
      alt={`Фотография: ${pseudonym}`}
      fill
      sizes="132px"
      style={{ objectFit: 'cover', borderRadius: 'var(--radius)' }}
      onError={() => setPhotoError(true)}
    />
  ) : (
    <>
      <span data-testid="welcome-species-glyph" aria-hidden="true" style={{ fontFamily: 'var(--nd-serif)', fontSize: '2.4rem', fontWeight: 700 }}>
        {glyph}
      </span>
      <span style={{ ...microStyle, color: 'var(--text-muted)', textAlign: 'center' }}>{pseudonym}</span>
    </>
  )}
</div>
```

4. Сразу после закрывающего `</div>` грид-контейнера карточки (после строки с правой ячейкой `Сессия: {sessionName}`) добавить блок атрибуции — только когда показываем фото:
```tsx
{showPhoto && photo && (
  <p style={{ margin: '0.4rem 0 0', ...microStyle, color: 'var(--text-muted)' }}>
    фото: {photo.author} · {photo.license}
  </p>
)}
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run:
```bash
npx jest components/nd/MatchingWelcome.test.tsx
```
Expected: PASS (2 теста).

- [ ] **Step 5: Lint + typecheck**

Run:
```bash
npm run lint && npm run typecheck
```
Expected: без ошибок. (Если линт ругается на `import/first` — поднять все импорты к верху файла.)

- [ ] **Step 6: Commit**

```bash
git add components/nd/MatchingWelcome.tsx components/nd/MatchingWelcome.test.tsx
git commit -m "feat(matching): show species photo on welcome screen with attribution"
```

---

## Task 5: E2E + документация

**Files:**
- Modify: `e2e/matching-reader-circles.spec.ts`
- Modify: `components/nd/MatchingWelcome.tsx` (добавить `data-testid` на ячейку-иллюстрацию для e2e, если ещё не добавлен)
- Modify: `docs/wiki/` (нужный раздел про matching), `docs/features/` (раздел matching, если есть)

- [ ] **Step 1: Добавить testid на ячейку-иллюстрацию**

В `components/nd/MatchingWelcome.tsx` к `<div aria-label={`Иллюстрация ника ${pseudonym}`} ...>` (из Task 4) добавить `data-testid="welcome-illustration"`.

- [ ] **Step 2: Расширить e2e welcome-теста**

В `e2e/matching-reader-circles.spec.ts`, в тесте `matching shows welcome screen until the reader explicitly joins`, после строки
`await expect(page.getByRole('button', { name: 'Войти' })).toBeVisible()` добавить:

```ts
// Ячейка-иллюстрация ника рендерится: либо фото (img), либо буква-глиф
const illustration = page.getByTestId('welcome-illustration')
await expect(illustration).toBeVisible()
const hasImg = await illustration.locator('img').count()
const hasGlyph = await page.getByTestId('welcome-species-glyph').count()
expect(hasImg + hasGlyph).toBeGreaterThan(0)
```

- [ ] **Step 3: Прогнать e2e welcome-тест**

Run:
```bash
npm run playwright test e2e/matching-reader-circles.spec.ts -g "welcome screen"
```
Expected: PASS. (Требуется `.env.test.local`; если e2e-окружение не настроено локально — отметить это и положиться на CI/nightly, см. CLAUDE.md.)

- [ ] **Step 4: Обновить Wiki + features**

В `docs/wiki/` (раздел про /matching или псевдонимы) добавить абзац: на приветственном экране /matching показывается фотография вида-псевдонима (источник — Wikimedia Commons, лицензии PD/CC0/CC-BY/CC-BY-SA с атрибуцией под фото); если фото для вида нет — показывается буква-категория. Фото собираются вручную скриптом `scripts/fetch-pseudonym-photos.ts` и лежат в `public/matching/species/`. Внутри сессии используются буквы.

Если есть `docs/features/` раздел про matching — добавить тот же факт кратко.

- [ ] **Step 5: Финальная проверка всего пакета**

Run:
```bash
npm run lint && npm run typecheck && npm test
```
Expected: всё зелёное.

- [ ] **Step 6: Commit**

```bash
git add e2e/matching-reader-circles.spec.ts components/nd/MatchingWelcome.tsx docs/
git commit -m "test(matching): e2e welcome illustration + docs"
```

---

## Notes для исполнителя

- **PR-flow (CLAUDE.md):** всю работу вести в feature-ветке (напр. `feat/matching-species-photos`), не коммитить в `main`. PR + auto-merge после зелёного CI. Текущая ветка `fix/header-polish` — НЕ для этой задачи, создать новую от свежего `main`.
- **Канон:** никаких сырых хексов — только `var(--…)`; острые углы (`var(--radius)`); без теней. Inline `style` + `var()` — канон проекта.
- **Манифест генерируется** — `lib/matching/species-images.generated.ts` коммитится как артефакт, руками не правится (кроме удаления заведомо неверных записей в Task 2 Step 2).
- **E2E нужен** — да: меняется условный рендер welcome-экрана (бизнес-логика photo/glyph). Покрыт в Task 5.
- **Wiki нужна** — да: новая пользовательская деталь. Покрыта в Task 5 Step 4.
