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
const REST_SUMMARY = 'https://ru.wikipedia.org/api/rest_v1/page/summary/'
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php'
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

// свободные лицензии с атрибуцией: CC0, Public domain, CC BY(-SA), GFDL,
// Copyrighted free use, Attribution
const ACCEPT = /^(cc0|public domain|cc by|gfdl|copyrighted free use|attribution)/i

// Ники, чья статья — disambiguation / без фото / под другим названием.
// Значение — точное название статьи ru.wikipedia (проверено: standard + есть фото).
// Имя файла всё равно строится из самого ника (slugify(name)).
const MANUAL_TITLES: Record<string, string> = {
  Кугуар: 'Пума', Норка: 'Американская норка', Панда: 'Большая панда',
  Альбатрос: 'Альбатросовые', Ворона: 'Серая ворона', Горлица: 'Горлицы',
  Дятел: 'Дятловые', Казарка: 'Казарки', Кайра: 'Кайры', Камышёвка: 'Камышовки',
  Малиновка: 'Зарянка', Мухоловка: 'Мухоловковые', Нырок: 'Нырки', Овсянка: 'Овсянковые',
  Орёл: 'Орлы', Орлан: 'Орланы', Синица: 'Синицы', Славка: 'Славки', Тетерев: 'Тетерева',
  Чечётка: 'Чечётки', Бычок: 'Бычковые', Кутум: 'Кутум (рыба)', Мурена: 'Мурены',
  Навага: 'Дальневосточная навага', Рак: 'Десятиногие раки', Скат: 'Скаты',
  Судак: 'Обыкновенный судак', Угорь: 'Речной угорь', Бражник: 'Бражники',
  Веснянка: 'Веснянки', Усач: 'Усачи (жуки)', Клоп: 'Настоящие щитники',
  Мотылёк: 'Чешуекрылые', Осётр: 'Русский осётр', Сайра: 'Сайры', Таймень: 'Таймени',
  Мартын: 'Чайковые', Маралка: 'Марал', Пузанок: 'Алоза', Листоед: 'Листоеды',
}

// Ники, для которых вручную выбран КОНКРЕТНЫЙ файл Commons (а не lead-image статьи).
// Значение — имя файла без префикса `File:` (как в URL страницы файла, пробелы или _ — оба ок).
// Имеет приоритет над MANUAL_TITLES и авто-резолвом.
const MANUAL_FILES: Record<string, string> = {
  Мальма: 'Dolly-Varden- Morgan Bond, U of Washington edit (15651417154).jpg',
}

interface ManifestEntry { file: string; author: string; license: string; sourceUrl: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}

/** Имя файла из upload.wikimedia.org URL → 'Portrait_of_owls.jpg' (декодированное). */
function fileNameFromUrl(src: string): string | null {
  try {
    const parts = new URL(src).pathname.split('/').filter(Boolean)
    // Для thumb-URL (.../thumb/x/xx/Name.jpg/640px-Name.jpg) реальное имя файла —
    // предпоследний сегмент; для прямого URL — последний.
    const name = parts.includes('thumb') ? parts[parts.length - 2] : parts[parts.length - 1]
    return name ? decodeURIComponent(name) : null
  } catch {
    return null
  }
}

type ResolveResult =
  | { ok: true; author: string; license: string; sourceUrl: string; thumbUrl: string }
  | { ok: false; reason: string }

/** Лицензия + thumbnail по имени файла Commons. fallbackSrc — если у файла нет thumburl. */
async function fetchFileInfo(fileName: string, fallbackSrc?: string): Promise<ResolveResult> {
  const info = await getJson(
    `${COMMONS_API}?${new URLSearchParams({
      action: 'query', titles: `File:${fileName}`, prop: 'imageinfo',
      iiprop: 'extmetadata|url', iiurlwidth: '640', format: 'json', origin: '*',
    })}`,
  )
  const pages = info?.query?.pages ?? {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const first: any = Object.values(pages)[0]
  const ii = first?.imageinfo?.[0]
  if (!ii) return { ok: false, reason: 'no-license-info' }
  const meta = ii.extmetadata ?? {}
  const license = stripHtml(meta.LicenseShortName?.value ?? '')
  if (!ACCEPT.test(license)) return { ok: false, reason: `license:${license || 'unknown'}` }
  const author = stripHtml(meta.Artist?.value ?? '') || 'Wikimedia Commons'
  const thumbUrl: string = ii.thumburl ?? ii.url ?? fallbackSrc ?? ''
  if (!thumbUrl) return { ok: false, reason: 'no-thumb' }
  return {
    ok: true,
    thumbUrl,
    author,
    license,
    sourceUrl: ii.descriptionurl ?? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileName)}`,
  }
}

async function resolve(name: string): Promise<ResolveResult> {
  // 0) Явно выбранный файл Commons имеет приоритет
  const forcedFile = MANUAL_FILES[name]
  if (forcedFile) return fetchFileInfo(forcedFile)

  // 1) заглавное изображение статьи через REST summary (надёжнее pageimages, ловит disambiguation)
  const title = MANUAL_TITLES[name] ?? name
  const summary = await getJson(REST_SUMMARY + encodeURIComponent(title))
  if (summary?.type === 'disambiguation') return { ok: false, reason: 'disambiguation' }
  const src: string | undefined = summary?.originalimage?.source ?? summary?.thumbnail?.source
  if (!src) return { ok: false, reason: 'no-image' }
  const fileName = fileNameFromUrl(src)
  if (!fileName) return { ok: false, reason: 'no-filename' }

  // 2) лицензия + thumbnail по файлу с Commons
  return fetchFileInfo(fileName, src)
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  // Опциональный аргумент — обновить только один ник, остальной манифест сохранить.
  //   npx ts-node ... scripts/fetch-pseudonym-photos.ts Мальма
  const only = process.argv[2]
  let names: readonly string[] = ANIMALS
  let manifest: Record<string, ManifestEntry> = {}
  if (only) {
    if (!ANIMALS.includes(only)) {
      console.error(`Ник "${only}" не найден в ANIMALS (lib/matching/pseudonyms.ts)`)
      process.exit(1)
    }
    // стартуем от текущего манифеста, чтобы не потерять остальные записи
    const existing = (await import('../lib/matching/species-images.generated')).SPECIES_PHOTOS
    manifest = { ...existing }
    names = [only]
    console.log(`Обновляю только: ${only}`)
  }

  const misses: { name: string; reason: string }[] = []

  for (const name of names) {
    try {
      const r = await resolve(name)
      if (!r.ok) { misses.push({ name, reason: r.reason }); console.warn(`SKIP ${name}: ${r.reason}`); continue }
      const slug = slugify(name)
      const buf = Buffer.from(await (await fetch(r.thumbUrl, { headers: { 'User-Agent': UA } })).arrayBuffer())
      // fit:'inside' — сохраняем пропорции (без кропа), длинная сторона ≤ 512
      await sharp(buf).resize(512, 512, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 })
        .toFile(path.join(OUT_DIR, `${slug}.webp`))
      manifest[name] = { file: `/matching/species/${slug}.webp`, author: r.author, license: r.license, sourceUrl: r.sourceUrl }
      console.log(`OK  ${name} -> ${slug}.webp [${r.license}]`)
    } catch (e) {
      misses.push({ name, reason: `error:${(e as Error).message}` })
      console.warn(`SKIP ${name}: ${(e as Error).message}`)
    }
    await new Promise((res) => setTimeout(res, 200)) // вежливый rate-limit
  }

  const body =
    `// AUTO-GENERATED by scripts/fetch-pseudonym-photos.ts — do not edit by hand.\n` +
    `export interface PseudonymPhoto { file: string; author: string; license: string; sourceUrl: string }\n` +
    `export const SPECIES_PHOTOS: Record<string, PseudonymPhoto> = ${JSON.stringify(manifest, null, 2)}\n`
  fs.writeFileSync(MANIFEST, body)
  console.log(`\nDone. ${Object.keys(manifest).length} photos, ${misses.length} misses:`)
  for (const m of misses) console.log(`  - ${m.name}: ${m.reason}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
