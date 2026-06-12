// Низкоуровневые fetch-хелперы для мутаций личного списка матчинга.
// Вынесены из MatchingPersonalList, чтобы их мог переиспользовать BookDetailProvider
// без циклического импорта (PersonalList импортирует useBookDetail из провайдера).

export type PriorityMutationSource = 'matching_priority_gate'

export function mutationUrl(path: string, mutationUserId?: string): string {
  if (!mutationUserId) return path
  return `${path}?as=${encodeURIComponent(mutationUserId)}`
}

export async function patchPriorities(
  bookIds: string[],
  mutationUserId?: string,
  source?: PriorityMutationSource,
): Promise<void> {
  await fetch(mutationUrl('/api/matching/priorities', mutationUserId), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(source ? { bookIds, source } : { bookIds }),
  })
}

export async function patchStatus(bookId: string, status: string | null, mutationUserId?: string): Promise<void> {
  await fetch(mutationUrl(`/api/signup-books/${bookId}/status`, mutationUserId), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status }),
  })
}

export async function addToList(bookId: string, mutationUserId?: string): Promise<void> {
  await fetch(mutationUrl('/api/matching/books', mutationUserId), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bookId }),
  })
}

export async function removeFromList(bookId: string, mutationUserId?: string): Promise<void> {
  await fetch(mutationUrl(`/api/matching/books/${bookId}`, mutationUserId), { method: 'DELETE' })
}
