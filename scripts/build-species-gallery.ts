/* eslint-disable no-console */
/**
 * Собирает HTML-галерею всех используемых фото видов из манифеста, чтобы их
 * можно было разом просмотреть в браузере (что где используется, ник, лицензия).
 *
 *   npx ts-node --transpile-only -P tsconfig.scripts.json scripts/build-species-gallery.ts
 *   open species-gallery.html      # macOS
 *
 * Файл species-gallery.html — временный артефакт (в .gitignore), не коммитится.
 */
import fs from 'node:fs'
import path from 'node:path'
import { SPECIES_PHOTOS } from '../lib/matching/species-images.generated'

const OUT = path.resolve(__dirname, '..', 'species-gallery.html')

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
}

const entries = Object.entries(SPECIES_PHOTOS).sort(([a], [b]) => a.localeCompare(b, 'ru'))

const cards = entries
  .map(([nick, p]) => `
    <figure>
      <a href="${esc(p.sourceUrl)}" target="_blank" rel="noopener">
        <img src="public${esc(p.file)}" alt="${esc(nick)}" loading="lazy" />
      </a>
      <figcaption>
        <strong>${esc(nick)}</strong>
        <span>${esc(p.license)}</span>
        <span class="author">${esc(p.author)}</span>
      </figcaption>
    </figure>`)
  .join('')

const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<title>Фото видов — ${entries.length}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 24px; background: #f9f5ee; color: #111; }
  h1 { font-family: Georgia, serif; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 16px; }
  figure { margin: 0; border: 1px solid #e5e5e5; background: #fff; }
  img { width: 100%; height: 150px; object-fit: contain; background: #ede5d8; display: block; }
  figcaption { padding: 6px 8px; font-size: 12px; display: flex; flex-direction: column; gap: 2px; }
  figcaption strong { font-size: 14px; }
  figcaption span { color: #666; }
  .author { color: #999; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style></head>
<body>
  <h1>Фото видов-псевдонимов — ${entries.length}</h1>
  <p>Клик по картинке открывает страницу файла на Commons. Чтобы заменить фото — добавь ник в <code>MANUAL_FILES</code> или <code>MANUAL_TITLES</code> в <code>scripts/fetch-pseudonym-photos.ts</code>.</p>
  <div class="grid">${cards}
  </div>
</body></html>
`

fs.writeFileSync(OUT, html)
console.log(`Готово: ${OUT} (${entries.length} фото)`)
console.log('Открыть: open species-gallery.html')
