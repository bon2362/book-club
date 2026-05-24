# Настройка внешних сервисов

## 1. Google OAuth (Sign in with Google)

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

## 2. Resend (Email magic link)

1. Зарегистрироваться на https://resend.com
2. **API Keys → Create API Key**
3. (Опционально) Добавить и верифицировать свой домен для красивого `from`-адреса. Без домена работает с `onboarding@resend.dev` (только для тестов)

```bash
RESEND_API_KEY=re_...
```

В `lib/auth.ts` поменяйте `from: 'noreply@yourdomain.com'` на ваш адрес.

---

## 3. NextAuth Secret

Генерировать случайную строку:

```bash
openssl rand -base64 32
```

```bash
NEXTAUTH_SECRET=<результат>
```

---

## 4. Admin Email

```bash
# Email аккаунта, который будет иметь доступ к /admin
ADMIN_EMAIL=your@email.com
```

---

## 5. Полный `.env.local`

```bash
NEXTAUTH_SECRET=<random-32-bytes>
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=123...abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
ADMIN_EMAIL=your@email.com
RESEND_API_KEY=re_...
```

---

## 6. Локальный запуск

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
