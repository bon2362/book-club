# Профиль пользователя

## Что делает
Авторизованные пользователи могут просматривать и редактировать профиль через выдвигающийся drawer. В drawer три вкладки: личные данные (имя, контакты), приоритеты книг (drag-to-rank) и языковые предпочтения.

## Как работает
- **ProfileDrawer** — client component (`components/nd/ProfileDrawer.tsx`); открывается кликом по аватарке в header
- **ContactsForm** — автоматически открывается для авторизованных пользователей без данных профиля (`isLoggedIn && !currentUser && !savedUser`); собирает имя и контактную информацию, пишет напрямую в `users.name` и `users.contacts`
- **Данные профиля** — пользовательские поля живут в таблице `users`: `name`, `contacts`, `languages`, `image`, `contact_email`. Поле `contacts` является тем Telegram/contact, который пользователь хочет показывать в профиле и админке. Технические auth-данные живут отдельно в `user_identities`; `user_identities.telegram_username` нужен для Telegram identity/auth и не показывается на сайте.
- **Приоритеты книг** — таблица `book_priorities` (`userId`, `bookId`, `rank`, `updatedAt`); обновляется через `POST /api/priorities`; название для UI берётся join-ом из `books.title`; отображается как числа ранга рядом с книгами (до первого ранжирования показывается `—`)
- **Языки** — `users.languages` (JSON-массив), редактируется через `/api/profile`
- **Фидбек** — `FeedbackForm` отправляет в `POST /api/feedback`, который и шлёт письмо админу через Resend, и сохраняет запись в таблицу `feedback` (`user_id` nullable — анонимные допустимы)
- **Выход** — доступен из drawer; вызывает `signOut()` из NextAuth
- **Удаление аккаунта** — `DELETE /api/profile` через `db.delete(users)` каскадом удаляет всё связанное (`accounts`, `sessions`, `book_priorities`, `book_submissions`, `signup_books`); поле `feedback.user_id` обнуляется (`onDelete: 'set null'`), записи остаются

## Ключевые файлы
- `components/nd/ProfileDrawer.tsx` — оболочка drawer (вкладки, открытие/закрытие)
- `components/nd/ContactsForm.tsx` — форма имени и контактов (автооткрытие для новых пользователей)
- `components/nd/FeedbackForm.tsx` — форма обратной связи
- `app/api/profile/route.ts` — GET/PATCH данных профиля пользователя
- `app/api/priorities/route.ts` — GET/POST ранжирования книг
- `app/api/feedback/route.ts` — приём фидбека (email + БД)
- `lib/db/schema.ts` — таблицы `users` (профиль и contacts), `user_identities` (способы входа), `book_priorities`, `signup_books`, `feedback`
