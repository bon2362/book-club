export const metadata = {
  title: 'О проекте — Долгое наступление',
}

export default async function VibePage() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA
  const shortSha = sha ? sha.slice(0, 7) : null
  const commitMsg = process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null
  const buildTime = process.env.BUILD_TIME
    ? new Date(process.env.BUILD_TIME).toLocaleString('ru-RU', {
        timeZone: 'Europe/Berlin',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : null
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
            href="https://slowreading.club"
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
            slowreading.club
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
              63% кода — это UI-компоненты. API и бизнес-логика занимают
              примерно равные доли — около 12% каждая. Тесты покрывают
              ключевые модули: парсинг таблиц, поиск, карточки и обложки.
            </p>
          </div>
        </Section>

      </div>
    </div>
    <footer style={{
      borderTop: '1px solid #E5E5E5',
      padding: '1rem 1.5rem',
      fontFamily: 'var(--nd-sans), system-ui, sans-serif',
      fontSize: '0.7rem',
      color: '#999',
      display: 'flex',
      flexWrap: 'wrap',
      gap: '0.4rem 1rem',
      alignItems: 'center',
    }}>
      {buildTime && <span>Деплой: <b style={{ color: '#555' }}>{buildTime} CET</b></span>}
      {shortSha && (
        <span>Коммит:{' '}
          <a
            href={`https://github.com/bon2362/book-club/commit/${sha}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#555', fontFamily: 'monospace', textDecoration: 'none', borderBottom: '1px solid #ccc' }}
          >
            {shortSha}
          </a>
        </span>
      )}
      {commitMsg && <span style={{ color: '#777' }}>{commitMsg}</span>}
    </footer>
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
  { title: 'Каталог книг с обложками', desc: 'Список книг подтягивается из Google Таблицы: обложки, описания, страницы, ссылка на файл. Фильтрация по теме и автору, полнотекстовый поиск' },
  { title: 'Два вида списка книг', desc: 'Переключение между сеткой карточек и компактной таблицей. В табличном виде — без обложек и описаний, зато весь список умещается на один экран. Выбор сохраняется' },
  { title: 'Запись на книгу', desc: 'Участник отмечает книги, которые хочет читать. На каждой карточке виден счётчик — сколько человек уже записалось' },
  { title: 'Статусы книг', desc: 'Организатор отмечает книгу как «Сейчас читаем» или «Прочитано». Прочитанные визуально приглушены и недоступны для записи' },
  { title: 'Вход через Google или email', desc: 'Google OAuth или магическая ссылка на почту — без паролей и отдельной регистрации. Письма уходят с кастомным HTML-шаблоном с брендингом клуба' },
  { title: 'Профиль участника', desc: 'Имя и Telegram-аккаунт, редактирование в любой момент. Участник может удалить свой аккаунт самостоятельно' },
  { title: 'Тёмная тема', desc: 'Светлый и тёмный режим, выбор сохраняется между сессиями без мерцания при загрузке' },
  { title: 'Панель администратора', desc: 'Три вкладки: участники (снятие с книги, удаление аккаунта), книги с числом и именами записавшихся, теги с редактором описаний' },
  { title: 'Описания тегов', desc: 'Организатор добавляет пояснение к каждой теме через панель администратора. При выборе тега описание появляется над сеткой книг' },
  { title: 'Описание клуба на главной', desc: 'Краткое приветствие над каталогом. Закрывается крестиком — решение сохраняется в куке, при следующих визитах блок не показывается' },
]

const STACK = [
  { name: 'Next.js 14', role: 'Основа сайта', desc: '«Движок» приложения — отвечает за быструю загрузку страниц и связывает все части вместе' },
  { name: 'Google Таблицы', role: 'Каталог книг', desc: 'Список книг живёт в обычной таблице — организатор редактирует её, сайт подтягивает изменения автоматически. Там же хранятся ссылки на обложки' },
  { name: 'Google OAuth', role: 'Вход через Google', desc: 'Стандартная кнопка «Войти с Google» — та же, что на многих сайтах, никакой отдельной регистрации' },
  { name: 'Resend', role: 'Вход через email', desc: 'Отправляет магическую ссылку на почту с кастомным HTML-письмом в стиле клуба. Письма уходят с домена slowreading.club' },
  { name: 'Neon Postgres', role: 'База данных', desc: 'Хранит сессии пользователей, статусы книг («читаем» / «прочитано») и описания тегов' },
  { name: 'NextAuth v5', role: 'Авторизация', desc: 'Библиотека, которая управляет входом и выходом — связывает Google и email с базой данных' },
  { name: 'Vercel', role: 'Хостинг', desc: 'Платформа, на которой живёт сайт: принимает код и делает его доступным в интернете' },
  { name: 'slowreading.club', role: 'Домен', desc: 'Кастомный домен проекта. Также верифицирован как отправитель в Resend и зарегистрирован в Google Postmaster Tools для контроля доставляемости писем' },
]

const DECISIONS = [
  {
    title: 'Google Таблицы как база данных для книг',
    body: 'Нетипичное, но практичное решение. Организатор работает в привычном инструменте, не нужен отдельный интерфейс для контента. Добавить книгу — значит вписать строку в таблицу.',
  },
  {
    title: 'Обложки напрямую из таблицы, без внешнего API',
    body: 'Изначально обложки подтягивались через Google Books API, но тот отдавал 429 Too Many Requests. Решение — просто хранить ссылку на обложку в отдельной колонке таблицы. Организатор вставляет URL, сайт показывает картинку.',
  },
  {
    title: 'Авторизация без пароля',
    body: 'Два способа входа — Google OAuth и магическая ссылка на почту — оба без паролей. Участникам не нужно ничего запоминать. Google — для удобства, email — для тех, кто не хочет привязывать Google-аккаунт.',
  },
  {
    title: 'Тёмная тема без мерцания',
    body: 'Встроен технический приём: тема применяется ещё до того, как страница отрисуется. Пользователь никогда не видит «вспышки» при загрузке.',
  },
  {
    title: 'Немедленный разлогин при удалении пользователя администратором',
    body: 'Сессии хранятся в JWT-токенах на клиенте — сервер не может их отозвать напрямую. Решение: при каждой проверке сессии делается запрос к базе данных. Если пользователь удалён — jwt callback возвращает null, NextAuth очищает cookie, и пользователь выходит на следующем запросе.',
  },
]

const STATS = [
  { value: '~3 700', label: 'строк кода' },
  { value: '17', label: 'реализованных функций' },
  { value: '8', label: 'сервисов и технологий' },
  { value: '2', label: 'способа входа' },
]

const CODE_ROWS = [
  { category: 'UI-компоненты (страницы, карточки, формы, хедер)', lines: 2350 },
  { category: 'Бизнес-логика (Sheets, авторизация, БД, поиск)', lines: 440 },
  { category: 'API-маршруты и серверные страницы', lines: 430 },
  { category: 'Тесты', lines: 310 },
  { category: 'Стили и конфигурация', lines: 150 },
]
