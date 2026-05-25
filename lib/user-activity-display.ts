export const USER_ACTIVITY_DISPLAY: Record<string, { emoji: string; label: string }> = {
  site_visit: { emoji: '👀', label: 'Пользователь заходил на сайт' },
  sign_in: { emoji: '🔑', label: 'Пользователь вошёл в аккаунт' },
  profile_submitted: { emoji: '📝', label: 'Пользователь заполнил профиль' },
  profile_updated: { emoji: '✏️', label: 'Пользователь обновил профиль' },
  books_selected: { emoji: '📚', label: 'Пользователь выбрал книги для чтения' },
  priorities_updated: { emoji: '🔢', label: 'Пользователь изменил порядок приоритетов' },
  submission_created: { emoji: '💡', label: 'Пользователь предложил книгу' },
  feedback_created: { emoji: '💬', label: 'Пользователь отправил обратную связь' },
  user_created: { emoji: '✨', label: 'Пользователь впервые появился в системе' },
  sheets_import: { emoji: '📥', label: 'Активность создана импортом из старых данных' },
}

export const UNKNOWN_USER_ACTIVITY_DISPLAY = {
  emoji: '•',
  label: 'Тип активности не определён',
}

export function getUserActivityDisplay(type: string | null | undefined) {
  if (!type) return UNKNOWN_USER_ACTIVITY_DISPLAY
  return USER_ACTIVITY_DISPLAY[type] ?? UNKNOWN_USER_ACTIVITY_DISPLAY
}
