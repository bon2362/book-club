import type { DiffSummary } from './types'

export function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}

export function textsCount(n: number): string {
  return `${n} ${pluralRu(n, 'текст', 'текста', 'текстов')}`
}

export function collectionsCount(n: number): string {
  return `${n} ${pluralRu(n, 'подборка', 'подборки', 'подборок')}`
}

export function markdownExcerpt(markdown: string, max = 200): string {
  const plain = markdown
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|[-*+]|\d+\.)\s+/gm, '')
    .replace(/[*_`>~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (plain.length <= max) return plain
  const cut = plain.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export function formatChangedAt(date: Date, now: Date): { relative: string; absolute: string } {
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
  let relative: string
  if (days <= 0) {
    relative = 'сегодня'
  } else if (days === 1) {
    relative = 'вчера'
  } else if (days < 14) {
    relative = `${days} ${pluralRu(days, 'день', 'дня', 'дней')} назад`
  } else {
    const weeks = Math.floor(days / 7)
    relative = `${weeks} ${pluralRu(weeks, 'неделю', 'недели', 'недель')} назад`
  }
  const absolute = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
  return { relative, absolute }
}

export function formatDiffSummary(summary: DiffSummary): string {
  return [
    summary.added > 0 ? `+${summary.added}` : null,
    summary.removed > 0 ? `−${summary.removed}` : null,
    summary.textChanged ? 'текст' : null,
    summary.orderChanged ? 'порядок' : null,
  ].filter(Boolean).join(' · ')
}

const ISSUE_TEXT: Record<string, string> = {
  title_required: 'Напишите название',
  title_too_long: 'Название длиннее 120 символов',
  description_required: 'Напишите описание',
  description_too_long: 'Описание длиннее 5000 символов',
  display_name_required: 'Укажите подпись',
  display_name_too_long: 'Подпись длиннее 60 символов',
  too_few_books: 'Нужно минимум два текста из каталога',
  too_many_books: 'В подборке не больше 50 текстов',
  duplicate_books: 'Один текст добавлен дважды',
  reason_required: 'Напишите причину',
  book_not_published: 'Эта книга ещё не опубликована в каталоге',
  migration_required: 'Подборки ещё не включены на сервере',
}

export function collectionIssueText(issue: string): string {
  return ISSUE_TEXT[issue] ?? 'Не удалось сохранить подборку'
}
