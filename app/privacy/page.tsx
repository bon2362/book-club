import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Политика конфиденциальности — Долгое наступление',
  description: 'Как мы обрабатываем персональные данные пользователей сайта slowreading.club',
}

export default function PrivacyPage() {
  return (
    <main
      style={{
        maxWidth: '720px',
        margin: '0 auto',
        padding: '3rem 1.5rem 4rem',
        fontFamily: 'var(--nd-sans), system-ui, sans-serif',
        color: '#222',
        lineHeight: 1.6,
      }}
    >
      <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.15em', color: '#999', margin: '0 0 0.5rem' }}>
        Долгое наступление · Читательские круги
      </p>
      <h1
        style={{
          fontFamily: 'var(--nd-serif), Georgia, serif',
          fontWeight: 700,
          fontSize: '2rem',
          letterSpacing: '-0.02em',
          margin: '0 0 0.5rem',
        }}
      >
        Политика конфиденциальности
      </h1>
      <p style={{ fontSize: '0.8rem', color: '#888', margin: '0 0 2rem' }}>
        Действует с 18 мая 2026 года. Применяется к сайту{' '}
        <a href="https://www.slowreading.club" style={{ color: '#222' }}>slowreading.club</a>.
      </p>

      <section style={sectionStyle}>
        <h2 style={h2Style}>Кто обрабатывает данные</h2>
        <p>
          Сайт ведётся как частный некоммерческий проект книжного клуба. Контроллер данных
          (rukovaoc obrade podataka o ličnosti) — автор проекта, контакт для запросов
          по обработке персональных данных:{' '}
          <a href="mailto:bon2362@gmail.com" style={linkStyle}>bon2362@gmail.com</a>.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>Какие данные собираются</h2>
        <p>
          <strong>В нашей базе данных:</strong> email (полученный от провайдера авторизации
          — Google, Telegram или почтовой ссылки), отображаемое имя, контакт (обычно
          @username Telegram), список книг, на которые вы записались, ваши пожелания
          к админам.
        </p>
        <p>
          <strong>В системе аналитики PostHog (EU-регион, Финляндия):</strong> внутренний
          обезличенный идентификатор пользователя (UUID), страницы, которые вы открываете,
          действия (нажатие «Хочу читать», открытие формы и т. п.), общая информация
          о браузере и устройстве (тип, операционная система, страна по IP). <strong>В
          PostHog не передаются email, имя или другие данные, по которым можно прямо
          опознать человека.</strong>
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>Зачем мы это собираем</h2>
        <ul style={ulStyle}>
          <li>Связь с участниками: уведомления о встречах и подборках книг</li>
          <li>Учёт записей на чтение и формирование подборок</li>
          <li>Понимание, как используется сайт, чтобы улучшать продукт</li>
        </ul>
        <p>
          Правовое основание (pravni osnov): законный интерес контроллера
          (legitimni interes), а в части аналитики поведения — также добровольное
          согласие, выраженное продолжением пользования сайтом после ознакомления
          с этой политикой.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>Кому передаются данные</h2>
        <ul style={ulStyle}>
          <li>
            <strong>PostHog Inc.</strong> — обработчик данных для аналитики поведения.
            Данные хранятся в инфраструктуре PostHog Cloud EU (Финляндия).
            Подробнее: <a href="https://posthog.com/privacy" style={linkStyle} target="_blank" rel="noopener noreferrer">posthog.com/privacy</a>.
          </li>
          <li>
            <strong>Vercel Inc.</strong> — хостинг сайта и базовая аналитика страниц
            (cookieless).
          </li>
          <li>
            <strong>Neon (Postgres)</strong> — основная база данных проекта.
          </li>
          <li>
            <strong>Resend</strong> — отправка писем для входа по почтовой ссылке.
          </li>
          <li>
            <strong>Google</strong> и <strong>Telegram</strong> — поставщики
            авторизации, если вы выбрали соответствующий способ входа.
          </li>
        </ul>
        <p>
          Мы не продаём ваши данные и не передаём их рекламодателям. Данные могут
          храниться на серверах за пределами Сербии (в EU, США); такая передача
          допустима по ZZPL для перечисленных провайдеров.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>Сколько данные хранятся</h2>
        <ul style={ulStyle}>
          <li>Профиль и записи на книги — пока вы пользуетесь сайтом; удаляются при удалении аккаунта</li>
          <li>События в PostHog — стандартный срок хранения PostHog (до 7 лет)</li>
          <li>Технические логи Vercel — несколько дней</li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>Ваши права</h2>
        <p>В соответствии с Законом о защите персональных данных Сербии (ZZPL), вы имеете право:</p>
        <ul style={ulStyle}>
          <li>Получить копию данных, которые мы храним о вас</li>
          <li>Потребовать исправления неточных данных</li>
          <li>Потребовать удаления данных («право быть забытым»)</li>
          <li>Возразить против обработки на основании законного интереса</li>
          <li>Подать жалобу в Поверenika za informacije od javnog značaja i zaštitu podataka o ličnosti</li>
        </ul>
        <p>
          Чтобы воспользоваться правами, напишите на{' '}
          <a href="mailto:bon2362@gmail.com" style={linkStyle}>bon2362@gmail.com</a>.
          Удалить аккаунт можно самостоятельно в профиле — при этом мы удаляем
          вашу запись из нашей БД и инициируем удаление вашего профиля в PostHog.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>Дети</h2>
        <p>
          Сайт предназначен для пользователей старше 15 лет (минимальный возраст
          самостоятельного согласия на обработку персональных данных по ZZPL).
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>Изменения этой политики</h2>
        <p>
          Если мы существенно изменим политику, мы обновим дату в начале документа.
          Для активных пользователей мы постараемся уведомить об изменениях по электронной почте.
        </p>
      </section>

      <p style={{ marginTop: '3rem', fontSize: '0.85rem' }}>
        <Link href="/" style={linkStyle}>← На главную</Link>
      </p>
    </main>
  )
}

const sectionStyle: React.CSSProperties = {
  marginBottom: '2rem',
}

const h2Style: React.CSSProperties = {
  fontFamily: 'var(--nd-serif), Georgia, serif',
  fontSize: '1.2rem',
  fontWeight: 700,
  letterSpacing: '-0.01em',
  margin: '0 0 0.75rem',
}

const ulStyle: React.CSSProperties = {
  paddingLeft: '1.25rem',
  margin: '0 0 1rem',
}

const linkStyle: React.CSSProperties = {
  color: '#222',
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
}
