export interface MatchingInstructions {
  title: string
  lead: string
  expandLabel: string
  collapseLabel: string
  bodyMarkdown: string
}

export const DEFAULT_MATCHING_INSTRUCTIONS: MatchingInstructions = {
  title: 'Совпадения по вашим книгам',
  lead: 'Выбирайте все книги, которые будете читать',
  expandLabel: 'Подробнее',
  collapseLabel: 'Короче',
  bodyMarkdown: `- Выберите все книги, которые будете читать
- Книги отсортированы по степени интереса участни:ц, добавивших их в свои списки
- Нажмите на имя участни:цы, чтобы узнать, на какое место он:а поместила книгу
- В меню кнопки «Записаться ▾» можно включить авто-запись сразу на нескольких книгах — она действует, пока вы не запишетесь окончательно; книга сформируется при 2 окончательных записях и 3 участниках всего; круги — по 3–5 человек
- Можно читать несколько книг одновременно
- Разные группы могут читать одну и ту же книгу`,
}

export function normalizeMatchingInstructions(value: MatchingInstructions): MatchingInstructions {
  const normalized = Object.fromEntries(
    Object.entries(value).map(([key, fieldValue]) => [key, fieldValue.trim()]),
  ) as MatchingInstructions
  for (const [key, fieldValue] of Object.entries(normalized)) {
    if (!fieldValue) throw new Error(`${key} is required`)
  }
  return normalized
}
