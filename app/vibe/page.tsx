export const metadata = {
  title: 'О проекте — Долгое наступление',
}

export default function VibePage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        color: 'var(--text)',
        fontFamily: "'Georgia', 'Times New Roman', serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          padding: '2.5rem 2rem 2rem',
          maxWidth: '780px',
          margin: '0 auto',
        }}
      >
        <p
          style={{
            fontFamily: "'Georgia', serif",
            fontStyle: 'italic',
            fontSize: '0.75rem',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            margin: '0 0 0.75rem 0',
          }}
        >
          Книжный клуб
        </p>
        <h1
          style={{
            fontFamily: "'Playfair Display', 'Georgia', serif",
            fontWeight: 700,
            fontSize: 'clamp(1.75rem, 5vw, 2.75rem)',
            letterSpacing: '-0.03em',
            lineHeight: 1.15,
            color: 'var(--text)',
            margin: '0 0 1rem 0',
          }}
        >
          Долгое наступление
        </h1>
        <p
          style={{
            fontFamily: "'Georgia', serif",
            fontStyle: 'italic',
            fontSize: '1rem',
            lineHeight: 1.7,
            color: 'var(--text-secondary)',
            margin: 0,
            maxWidth: '560px',
          }}
        >
          Веб-приложение для книжного клуба: участники видят список книг,
          записываются на совместное чтение и оставляют контакты.
        </p>
        <div style={{ marginTop: '1.25rem' }}>
          <a
            href="https://book-club-slow-rising.vercel.app"
            style={{
              fontFamily: "'Georgia', serif",
              fontSize: '0.8125rem',
              color: 'var(--accent)',
              textDecoration: 'none',
              letterSpacing: '0.02em',
              borderBottom: '1px solid var(--accent)',
              paddingBottom: '1px',
              opacity: 0.85,
            }}
          >
            book-club-slow-rising.vercel.app
          </a>
        </div>
      </div>

      <div style={{ maxWidth: '780px', margin: '0 auto', padding: '0 2rem 4rem' }}>

        {/* Section: Цель */}
        <Section title="Цель проекта">
          <p style={bodyStyle}>
            Создать удобное веб-приложение, где участники книжного клуба «Долгое
            наступление» могут видеть список читаемых книг, записываться на
            совместное чтение и оставлять свои контакты.
          </p>
          <p style={bodyStyle}>
            Раньше для этого использовались чаты и таблицы — теперь всё собрано
            в одном месте с нормальным интерфейсом.
          </p>
        </Section>

        {/* Section: Функции */}
        <Section title="Основные функции">
          <FeatureGrid features={FEATURES} />
        </Section>

        {/* Section: Стек */}
        <Section title="Технологии и интеграции">
          <p style={{ ...bodyStyle, marginBottom: '1.5rem' }}>
            Каждый сервис выбирался под конкретную задачу — объяснение простым языком:
          </p>
          <StackTable items={STACK} />
        </Section>

        {/* Section: Решения */}
        <Section title="Ключевые технические решения">
          {DECISIONS.map((d, i) => (
            <DecisionCard key={i} title={d.title} body={d.body} />
          ))}
        </Section>

        {/* Section: Статистика */}
        <Section title="Статистика кода">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '1rem',
              marginBottom: '2rem',
            }}
          >
            {STATS.map((s, i) => (
              <StatCard key={i} value={s.value} label={s.label} />
            ))}
          </div>

          <p style={{ ...bodyStyle, marginBottom: '1.25rem' }}>
            Распределение по категориям:
          </p>
          <CodeTable rows={CODE_ROWS} />

          <div
            style={{
              marginTop: '1.5rem',
              borderLeft: '3px solid var(--border)',
              paddingLeft: '1rem',
            }}
          >
            <p style={{ ...bodyStyle, fontStyle: 'italic', margin: 0, color: 'var(--text-secondary)' }}>
              73% кода — это UI-компоненты. Два главных компонента (главная
              страница и панель администратора) вдвоём весят больше всей
              остальной логики вместе взятой.
            </p>
          </div>
        </Section>

      </div>
    </div>
  )
}

/* ─── Sub-components ──────────────────────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: '3rem' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          marginBottom: '1.5rem',
        }}
      >
        <h2
          style={{
            fontFamily: "'Playfair Display', 'Georgia', serif",
            fontWeight: 700,
            fontSize: '1.25rem',
            letterSpacing: '-0.01em',
            color: 'var(--text)',
            margin: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </h2>
        <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
      </div>
      {children}
    </div>
  )
}

function FeatureGrid({ features }: { features: typeof FEATURES }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: '0.875rem',
      }}
    >
      {features.map((f, i) => (
        <div
          key={i}
          style={{
            background: 'var(--bg-elevated)',
            borderLeft: '3px solid var(--accent)',
            padding: '0.875rem 1rem',
          }}
        >
          <div
            style={{
              fontFamily: "'Playfair Display', 'Georgia', serif",
              fontWeight: 600,
              fontSize: '0.9rem',
              color: 'var(--text)',
              marginBottom: '0.3rem',
            }}
          >
            {f.title}
          </div>
          <div
            style={{
              fontFamily: "'Georgia', serif",
              fontSize: '0.8rem',
              lineHeight: 1.55,
              color: 'var(--text-secondary)',
            }}
          >
            {f.desc}
          </div>
        </div>
      ))}
    </div>
  )
}

function StackTable({ items }: { items: typeof STACK }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
      {items.map((item, i) => (
        <div
          key={i}
          style={{
            display: 'grid',
            gridTemplateColumns: '160px 1fr',
            gap: '1rem',
            padding: '0.75rem 0',
            borderBottom: '1px solid var(--border-subtle)',
            alignItems: 'start',
          }}
        >
          <div
            style={{
              fontFamily: "'Georgia', serif",
              fontWeight: 700,
              fontSize: '0.85rem',
              color: 'var(--text)',
            }}
          >
            {item.name}
          </div>
          <div>
            <div
              style={{
                fontFamily: "'Georgia', serif",
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
                fontStyle: 'italic',
                marginBottom: '0.2rem',
              }}
            >
              {item.role}
            </div>
            <div
              style={{
                fontFamily: "'Georgia', serif",
                fontSize: '0.85rem',
                lineHeight: 1.5,
                color: 'var(--text-secondary)',
              }}
            >
              {item.desc}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function DecisionCard({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{
        borderLeft: '4px solid var(--accent)',
        paddingLeft: '1.25rem',
        marginBottom: '1.25rem',
      }}
    >
      <div
        style={{
          fontFamily: "'Playfair Display', 'Georgia', serif",
          fontWeight: 600,
          fontSize: '0.95rem',
          color: 'var(--text)',
          marginBottom: '0.35rem',
        }}
      >
        {title}
      </div>
      <p style={{ ...bodyStyle, margin: 0 }}>{body}</p>
    </div>
  )
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        padding: '1.25rem 1rem',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontFamily: "'Playfair Display', 'Georgia', serif",
          fontWeight: 700,
          fontSize: '2rem',
          color: 'var(--accent)',
          lineHeight: 1,
          marginBottom: '0.4rem',
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: "'Georgia', serif",
          fontSize: '0.75rem',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          lineHeight: 1.3,
        }}
      >
        {label}
      </div>
    </div>
  )
}

function CodeTable({ rows }: { rows: typeof CODE_ROWS }) {
  const total = rows.reduce((sum, r) => sum + r.lines, 0)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {rows.map((row, i) => (
        <div
          key={i}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 60px 120px',
            gap: '0.75rem',
            alignItems: 'center',
            padding: '0.5rem 0',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ fontFamily: "'Georgia', serif", fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            {row.category}
          </div>
          <div
            style={{
              fontFamily: "'Georgia', serif",
              fontSize: '0.875rem',
              color: 'var(--text)',
              fontWeight: 700,
              textAlign: 'right',
            }}
          >
            ~{row.lines}
          </div>
          <div style={{ position: 'relative', height: '6px', background: 'var(--border-subtle)' }}>
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                height: '100%',
                width: `${(row.lines / total) * 100}%`,
                background: 'var(--accent)',
                opacity: 0.7,
              }}
            />
          </div>
        </div>
      ))}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 60px 120px',
          gap: '0.75rem',
          padding: '0.6rem 0 0',
        }}
      >
        <div
          style={{
            fontFamily: "'Georgia', serif",
            fontSize: '0.8rem',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          Итого
        </div>
        <div
          style={{
            fontFamily: "'Playfair Display', 'Georgia', serif",
            fontWeight: 700,
            fontSize: '1rem',
            color: 'var(--accent)',
            textAlign: 'right',
          }}
        >
          ~{total}
        </div>
      </div>
    </div>
  )
}

/* ─── Styles ──────────────────────────────────────────────────── */

const bodyStyle: React.CSSProperties = {
  fontFamily: "'Georgia', serif",
  fontSize: '0.9375rem',
  lineHeight: 1.75,
  color: 'var(--text-secondary)',
  margin: '0 0 0.75rem 0',
}

/* ─── Data ────────────────────────────────────────────────────── */

const FEATURES = [
  { title: 'Каталог книг', desc: 'Список книг с обложками и авторами, обновляется через Google Таблицу без изменений в коде' },
  { title: 'Запись на книгу', desc: 'Участник отмечает книги, которые хочет читать — запись сохраняется' },
  { title: 'Вход через Google', desc: 'Одно нажатие, без паролей и регистрации' },
  { title: 'Профиль участника', desc: 'Имя и Telegram-аккаунт — организатор знает, с кем связаться' },
  { title: 'Тёмная тема', desc: 'Светлый и тёмный режим, выбор сохраняется' },
  { title: 'Панель администратора', desc: 'Сводка: кто записался на какую книгу, имена и контакты' },
]

const STACK = [
  { name: 'Next.js 14', role: 'Основа сайта', desc: '«Движок» приложения — отвечает за быструю загрузку страниц и связывает все части вместе' },
  { name: 'Google Таблицы', role: 'Каталог книг', desc: 'Список книг живёт в обычной таблице — организатор редактирует её, сайт подтягивает изменения автоматически' },
  { name: 'Google OAuth', role: 'Вход через Google', desc: 'Стандартная кнопка «Войти с Google» — та же, что на многих сайтах, никакой отдельной регистрации' },
  { name: 'Neon Postgres', role: 'База данных', desc: 'Хранит информацию о пользователях и их записях на книги' },
  { name: 'NextAuth v5', role: 'Авторизация', desc: 'Библиотека, которая управляет входом и выходом — связывает Google с базой данных' },
  { name: 'Vercel', role: 'Хостинг', desc: 'Платформа, на которой живёт сайт: принимает код и делает его доступным в интернете' },
]

const DECISIONS = [
  {
    title: 'Google Таблицы как база данных для книг',
    body: 'Нетипичное, но практичное решение. Организатор работает в привычном инструменте, не нужен отдельный интерфейс для контента. Добавить книгу — значит вписать строку в таблицу.',
  },
  {
    title: 'Авторизация без пароля',
    body: 'Вход только через Google снижает порог входа до нуля. Участникам не нужно придумывать и запоминать пароль — достаточно нажать одну кнопку.',
  },
  {
    title: 'Тёмная тема без мерцания',
    body: 'Встроен технический приём: тема применяется ещё до того, как страница отрисуется. Пользователь никогда не видит «вспышки» при загрузке.',
  },
]

const STATS = [
  { value: '~2 900', label: 'строк кода' },
  { value: '11', label: 'реализованных функций' },
  { value: '6', label: 'внешних сервисов' },
  { value: '2', label: 'способа входа' },
]

const CODE_ROWS = [
  { category: 'UI-компоненты (главная страница, admin, карточки)', lines: 1690 },
  { category: 'Документация (README, setup, ретроспектива)', lines: 275 },
  { category: 'Бизнес-логика (Sheets, авторизация, БД, поиск)', lines: 315 },
  { category: 'Тесты', lines: 200 },
  { category: 'API-маршруты', lines: 80 },
  { category: 'Стили и конфигурация', lines: 160 },
]
