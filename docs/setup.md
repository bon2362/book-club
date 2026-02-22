# Настройка внешних сервисов

## 1. Google Sheets — Service Account

### Создать Service Account

1. Перейти на https://console.cloud.google.com
2. Создать проект или выбрать существующий
3. Включить Google Sheets API: **APIs & Services → Enable APIs → Google Sheets API**
4. Создать сервисный аккаунт: **IAM & Admin → Service Accounts → Create Service Account**
   - Имя: `book-club-sheets`
   - Роль: не обязательна на уровне проекта
5. Войти в созданный аккаунт → **Keys → Add Key → JSON**
6. Скачать JSON-файл — это и есть `GOOGLE_SERVICE_ACCOUNT_KEY`

### Дать доступ к таблице

1. Открыть вашу Google Таблицу с книгами
2. Нажать **«Поделиться»**
3. Добавить email сервисного аккаунта (поле `client_email` из JSON) с правами **Редактора**

### Создать вкладку `signups`

Добавить в таблицу новую вкладку с именем `signups` и заголовками в строке 1:

| A | B | C | D | E | F |
|---|---|---|---|---|---|
| timestamp | user_id | name | email | contacts | selected_books |

### Заполнить переменные окружения

```bash
# GOOGLE_SHEETS_ID — из URL таблицы:
# https://docs.google.com/spreadsheets/d/ВОТ_ЭТОТ_ID/edit
GOOGLE_SHEETS_ID=...

# GOOGLE_SERVICE_ACCOUNT_KEY — полное содержимое JSON-файла (в одну строку или с \n)
GOOGLE_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"...","private_key":"...","client_email":"...",...}'
```

---

## 2. Google OAuth (Sign in with Google)

1. Google Cloud Console → **APIs & Services → Credentials → Create Credentials → OAuth Client ID**
2. Тип: **Web application**
3. Authorized JavaScript origins: `http://localhost:3000` (для dev)
4. Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`
5. Скопировать **Client ID** и **Client Secret**

```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

---

## 3. Resend (Email magic link)

1. Зарегистрироваться на https://resend.com
2. **API Keys → Create API Key**
3. (Опционально) Добавить и верифицировать свой домен для красивого `from`-адреса. Без домена работает с `onboarding@resend.dev` (только для тестов)

```bash
RESEND_API_KEY=re_...
```

В `lib/auth.ts` поменяйте `from: 'noreply@yourdomain.com'` на ваш адрес.

---

## 4. NextAuth Secret

Генерировать случайную строку:

```bash
openssl rand -base64 32
```

```bash
NEXTAUTH_SECRET=<результат>
```

---

## 5. Admin Email

```bash
# Email аккаунта, который будет иметь доступ к /admin
ADMIN_EMAIL=your@email.com
```

---

## 6. Полный `.env.local`

```bash
GOOGLE_SHEETS_ID=1abc...xyz
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
NEXTAUTH_SECRET=<random-32-bytes>
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=123...abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
ADMIN_EMAIL=your@email.com
RESEND_API_KEY=re_...
```

---

## 7. Локальный запуск

```bash
cd book-club
npm install
npm run dev
```

Открыть http://localhost:3000

---

## 8. Деплой на Vercel (Task 13)

```bash
npx vercel
```

После деплоя добавить production URL в Google OAuth:
- **Authorized redirect URIs**: `https://your-app.vercel.app/api/auth/callback/google`

И обновить `NEXTAUTH_URL` в Vercel env vars:
```
NEXTAUTH_URL=https://your-app.vercel.app
```
