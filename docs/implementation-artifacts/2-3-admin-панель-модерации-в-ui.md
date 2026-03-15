# Story 2.3: Admin-панель модерации в UI

Status: done

## Story

As an admin,
I want to see and manage all book submissions in the admin panel,
So that I can review, edit, approve or reject proposals without using the API directly.

## Acceptance Criteria

1. **[AC1 — Список заявок]** Admin-страница содержит таб "Заявки" со списком всех заявок и статусами (`pending`, `approved`, `rejected`)

2. **[AC2 — Детальный вид]** Клик на заявку разворачивает строку — видны все поля включая email автора и "Почему стоит прочитать?"

3. **[AC3 — Редактирование полей]** Admin изменяет поля и нажимает "Сохранить" → PATCH /api/admin/submissions/[id], UI обновляется

4. **[AC4 — Одобрить]** Кнопка "Одобрить" → PATCH с status=`approved` → UI обновляется, строка закрывается

5. **[AC5 — Отклонить]** Кнопка "Отклонить" → PATCH с status=`rejected` → UI обновляется, строка закрывается

## Tasks / Subtasks

- [x] Task 1: Добавить тип `Submission` и состояние в `AdminPanel.tsx` (AC: #1, #2)
  - [x] `type Submission` — все поля из GET /api/admin/submissions
  - [x] `'submissions'` добавить в `type View`
  - [x] useState: `submissions`, `submissionsLoaded`, `submissionFilter`, `selectedSubmissionId`, `submissionEdits`, `submissionActionLoading`
  - [x] `useEffect` — fetch GET /api/admin/submissions при переходе на таб

- [x] Task 2: Рендер таба и таблицы (AC: #1, #2)
  - [x] Кнопка "Заявки" в навигации табов
  - [x] Фильтры: Все / Ожидают / Одобренные / Отклонённые
  - [x] Таблица с колонками: Книга, Автор, Email, Статус, Дата, ▼/▲
  - [x] Раскрывающаяся строка с полями заявки и кнопками

- [x] Task 3: Действия — сохранить, одобрить, отклонить (AC: #3, #4, #5)
  - [x] `updateSubmissionEdit(id, field, value)` — локальные правки без сохранения
  - [x] `handleSaveSubmissionEdits(id)` — PATCH без смены статуса
  - [x] `handleSubmissionAction(id, status)` — PATCH со сменой статуса + закрыть строку

- [x] Task 4: Тесты (AC: #1–#5)
  - [x] `components/nd/AdminPanel.test.tsx`

## Dev Notes

### Загрузка данных

```typescript
useEffect(() => {
  if (view === 'submissions' && !submissionsLoaded) {
    fetch('/api/admin/submissions')
      .then(r => r.json())
      .then(d => { if (d.success) setSubmissions(d.data) })
      .catch(() => {})
      .finally(() => setSubmissionsLoaded(true))
  }
}, [view, submissionsLoaded])
```

### После PATCH — userEmail не в ответе

Маршрут PATCH возвращает строку из `bookSubmissions` без JOIN users. Нужно сохранять `userEmail` из существующего состояния:

```typescript
setSubmissions(prev => prev.map(s => s.id === id ? { ...d.data, userEmail: s.userEmail } : s))
```

### Файлы для изменения / создания

| Действие | Файл |
|---|---|
| Изменить | `components/nd/AdminPanel.tsx` |
| Создать | `components/nd/AdminPanel.test.tsx` |

### References

- Tab/table pattern: [Source: components/nd/AdminPanel.tsx]
- API: [Source: app/api/admin/submissions/route.ts, app/api/admin/submissions/[id]/route.ts]
- Test pattern (jsdom): [Source: components/nd/SubmitBookForm.test.tsx]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- ✅ Добавлен тип `Submission` и `SubmissionFilter` в AdminPanel.tsx
- ✅ Таб "Заявки" с ленивой загрузкой через GET /api/admin/submissions
- ✅ Фильтры: Все / Ожидают / Одобренные / Отклонённые
- ✅ Раскрывающаяся строка с полями (title, author, whyRead, topic, description, textUrl) и email автора
- ✅ Кнопки: Сохранить (только при наличии правок), Одобрить, Отклонить → PATCH с merge userEmail
- ✅ 9 тестов — рендер таба, загрузка, фильтр, детальный вид, одобрить, отклонить, редактирование

### File List

- `components/nd/AdminPanel.tsx` (изменён)
- `components/nd/AdminPanel.test.tsx` (создан)

### Change Log

- 2026-03-15: Реализована Story 2.3 — таб "Заявки" в AdminPanel с просмотром, редактированием и модерацией заявок.
