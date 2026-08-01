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
    <>
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
          Full-stack веб-приложение для книжного клуба: каталог книг с записью,
          личные кабинеты участников, система приоритетов, саммари прочитанных
          книг, режим командного матчинга в реальном времени, публичные ленты
          времени и инструменты организатора.
        </p>
        <div style={{ marginTop: '1.25rem' }}>
          <a
            href="https://www.slowreading.club"
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
            совместное чтение, расставлять приоритеты, предлагать книги, делиться
            саммари прочитанного и искать единомышленников для читательских групп.
          </p>
          <p style={bodyStyle}>
            Раньше для этого использовались чаты и таблицы — теперь всё собрано
            в одном месте с нормальным интерфейсом. Данные живут в Postgres,
            каталог управляется из удобной админки, а режим матчинга позволяет
            группам из трёх человек собраться за несколько минут в реальном времени.
          </p>
          <p style={bodyStyle}>
            Летом 2026 к сайту добавился раздел «Ленты времени»: исторические
            таймлайны, которые владелец собирает прямо на полотне и публикует по
            отдельной ссылке. Он переехал из локального десктопного приложения
            на SQLite — теперь это часть сайта с общей базой, аудитом и тестами.
          </p>
        </Section>

        {/* Section: Функции */}
        <Section title="Функции для участников">
          <FeatureGrid features={USER_FEATURES} />
        </Section>

        {/* Section: Функции организатора */}
        <Section title="Инструменты организатора">
          <FeatureGrid features={ADMIN_FEATURES} />
        </Section>

        {/* Section: Стек */}
        <Section title="Технологии и интеграции">
          <p style={{ ...bodyStyle, marginBottom: '1.5rem' }}>
            Каждый сервис выбирался под конкретную задачу:
          </p>
          <StackTable items={STACK} />
        </Section>

        {/* Section: Решения */}
        <Section title="Ключевые технические решения">
          {DECISIONS.map((d, i) => (
            <DecisionCard key={i} title={d.title} body={d.body} />
          ))}
        </Section>

        {/* Section: Dev Approach */}
        <Section title="Подход к разработке">
          <p style={{ ...bodyStyle, marginBottom: '1.75rem' }}>
            Проект разрабатывается AI-native: основной исполнитель —{' '}
            <strong style={{ color: 'var(--text)' }}>Claude Code</strong> (Anthropic),
            работающий в браузерном devcontainer прямо внутри репозитория.
            Это не «помощь с кодом» — Claude пишет, тестирует, коммитит и
            деплоит фичи от начала до конца.
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
              gap: '1rem',
              marginBottom: '1.5rem',
            }}
          >
            {DEV_APPROACH.map((item, i) => (
              <DevApproachCard key={i} {...item} />
            ))}
          </div>
          <p style={{ ...bodyStyle, marginTop: '1rem' }}>
            Итог: каждая задача — от идеи до деплоя — проходит через
            формализованный pipeline. Качество обеспечивается не ревью вручную,
            а автоматическими проверками на каждом этапе.
          </p>
        </Section>

        {/* Section: Ресурсы документации */}
        <Section title="Ресурсы">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '0.875rem',
            }}
          >
            {RESOURCES.map((r, i) => (
              <ResourceCard key={i} {...r} />
            ))}
          </div>
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
              1809 unit-тестов (248 suites) + 46 E2E-спецификаций (Playwright, 166 сценариев) —
              unit покрывают все API-маршруты, бизнес-логику и геометрию ленты времени,
              E2E проверяют ключевые пользовательские сценарии в ночном прогоне по main.
            </p>
          </div>
        </Section>

      </div>
    </div>
    <footer style={{
      borderTop: '1px solid var(--border)',
      padding: '1rem 1.5rem',
      fontFamily: 'var(--nd-sans), system-ui, sans-serif',
      fontSize: '0.7rem',
      color: 'var(--text-muted)',
      display: 'flex',
      flexWrap: 'wrap',
      gap: '0.4rem 1rem',
      alignItems: 'center',
    }}>
      {buildTime && <span>Деплой: <b style={{ color: 'var(--text-secondary)' }}>{buildTime} CET</b></span>}
      {shortSha && (
        <span>Коммит:{' '}
          <a
            href={`https://github.com/bon2362/book-club/commit/${sha}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', textDecoration: 'none', borderBottom: '1px solid var(--border)' }}
          >
            {shortSha}
          </a>
        </span>
      )}
      {commitMsg && <span style={{ color: 'var(--text-secondary)' }}>{commitMsg}</span>}
    </footer>
    </>
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

function FeatureGrid({ features }: { features: { title: string; desc: string }[] }) {
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

function DevApproachCard({ title, tag, body }: { title: string; tag: string; body: string }) {
  return (
    <div
      style={{
        border: '1px solid var(--border-subtle)',
        padding: '1.1rem 1.25rem',
        background: 'var(--bg-elevated)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', marginBottom: '0.5rem' }}>
        <div
          style={{
            fontFamily: "'Playfair Display', 'Georgia', serif",
            fontWeight: 600,
            fontSize: '0.9rem',
            color: 'var(--text)',
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontFamily: "'Georgia', serif",
            fontStyle: 'italic',
            fontSize: '0.7rem',
            color: 'var(--accent)',
            whiteSpace: 'nowrap',
          }}
        >
          {tag}
        </div>
      </div>
      <div
        style={{
          fontFamily: "'Georgia', serif",
          fontSize: '0.82rem',
          lineHeight: 1.6,
          color: 'var(--text-secondary)',
        }}
      >
        {body}
      </div>
    </div>
  )
}

function ResourceCard({ title, url, desc }: { title: string; url: string; desc: string }) {
  return (
    <div
      style={{
        border: '1px solid var(--border-subtle)',
        padding: '0.875rem 1rem',
        background: 'var(--bg-elevated)',
      }}
    >
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          fontFamily: "'Playfair Display', 'Georgia', serif",
          fontWeight: 600,
          fontSize: '0.9rem',
          color: 'var(--accent)',
          textDecoration: 'none',
          display: 'block',
          marginBottom: '0.3rem',
        }}
      >
        {title}
      </a>
      <div
        style={{
          fontFamily: "'Georgia', serif",
          fontSize: '0.8rem',
          lineHeight: 1.55,
          color: 'var(--text-secondary)',
        }}
      >
        {desc}
      </div>
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

const USER_FEATURES = [
  {
    title: 'Каталог книг с фильтрацией',
    desc: 'Список книг из Postgres: обложки, описания, страницы, ссылка на текст. Полнотекстовый поиск, фильтры по теме и автору, ярлыки «Новинка»',
  },
  {
    title: 'Два вида списка',
    desc: 'Сетка карточек или компактная таблица — весь список на один экран. Выбор сохраняется между сессиями',
  },
  {
    title: 'Запись на книгу',
    desc: 'Одним кликом, с обязательным выбором приоритета — участие в матчинге гарантировано каждой записи. Счётчик записавшихся на каждой карточке, читательские круги показывают, кто ещё хочет читать ту же книгу',
  },
  {
    title: 'Расстановка приоритетов',
    desc: 'Drag-and-drop сортировка книг в личном кабинете: участник расставляет книги от самой желанной к наименее. Помогает организатору формировать группы',
  },
  {
    title: 'Режим матчинга',
    desc: 'Координационное пространство для сбора читательских групп в реальном времени: анонимные псевдонимы с фото видов, онлайн-статус участников, закрепление сложившихся кругов, книгоцентричный режим и полноценная мобильная версия',
  },
  {
    title: 'Саммари книг',
    desc: 'Участник, прочитавший книгу, пишет Markdown-саммари: редактор с виджетами Википедии, оглавление, ревизии после публикации. Читатели — включая гостей — могут отметить саммари как «Полезно»',
  },
  {
    title: 'Личный кабинет',
    desc: 'Drawer справа: вкладки «Записал:ась», «Предложил:а», «Профиль». Редактирование имени и Telegram, языковые предпочтения, история заявок на книги',
  },
  {
    title: 'Предложить книгу',
    desc: 'Форма для участников: название, автор, почему стоит читать. Заявки уходят на модерацию к организатору, статус виден в личном кабинете',
  },
  {
    title: 'Три способа входа',
    desc: 'Google OAuth, магическая ссылка на почту или Telegram-бот (deep-link). Без регистрации и паролей. Сайт подсказывает, каким способом вы входили в прошлый раз, а в профиле можно привязать дополнительные способы к одному аккаунту',
  },
  {
    title: 'Статус книги',
    desc: 'Участник может отметить книгу как «Читаю» или «Прочитал:а» — личный прогресс виден в кабинете',
  },
  {
    title: 'Ленты времени',
    desc: 'Раздел /timeline: исторические таймлайны с событиями, интервалами и эпохами. Колесо панорамирует, Ctrl + колесо масштабирует — от 2 до 40 000 лет. Карточка события с описанием и картинкой, маркер «Сегодня», фильтр по типам, на узком экране — вертикальный список',
  },
  {
    title: 'Форма обратной связи',
    desc: 'Кнопка «Написать организатору» на любой странице. Сообщение уходит администратору через email',
  },
]

const ADMIN_FEATURES = [
  {
    title: 'Участники с приоритетами',
    desc: 'Фильтр по книге показывает всех записавшихся и их приоритет в виде бейджа «№X из N». Участники без приоритетов — в отдельной группе внизу',
  },
  {
    title: 'По книгам',
    desc: 'Список книг с числом и именами записавшихся — кого приглашать в группу. Управление статусами: «Сейчас читаем» / «Прочитано» — в том числе после закрытия матчинг-сессии',
  },
  {
    title: 'Редактор лент времени',
    desc: 'Событие или эпоха правятся прямо на полотне ленты: общие поля меняются во всех лентах сразу, заметка и видимость — только в открытой. Чип «Вся база» показывает ещё не прикреплённые элементы полупрозрачно, клик прикрепляет',
  },
  {
    title: 'Вкладка «Ленты времени»',
    desc: 'Справочник типов событий и список лент: создание, переименование, удаление, переключатель публикации и ссылка на публичную страницу. Черновик виден только администратору — остальным маршрут отвечает 404',
  },
  {
    title: 'Режим матчинга',
    desc: 'Создание и управление matching-сессией: добавление/удаление участников, смена режима на лету, аналитика предпочтений с диффом приоритетов, просмотр прошлых сессий, заморозка результата',
  },
  {
    title: 'Каталог и CRUD книг',
    desc: 'Добавление, редактирование, удаление книг прямо из панели. Загрузка обложки по URL, управление порядком в каталоге',
  },
  {
    title: 'Модерация заявок',
    desc: 'Входящие предложения книг: одобрить, отклонить с причиной или удалить. Одобренные попадают в каталог автоматически',
  },
  {
    title: 'Модерация саммари',
    desc: 'Саммари участников проходят проверку: администратор редактирует, публикует или отклоняет с причиной. Правки опубликованного текста — через отдельные ревизии',
  },
  {
    title: 'Управление пользователями',
    desc: 'Таблица участников с языковыми предпочтениями, слияние дублирующихся аккаунтов, привязка способов входа. Удаление пользователей: сессия закрывается немедленно',
  },
  {
    title: 'Журнал аудита',
    desc: 'Каждая мутация в БД фиксируется: кто, что, когда, снимки строки до и после. Просмотрщик с фильтрами, пагинацией и сортировкой прямо в панели',
  },
  {
    title: 'Редактор вводной секции',
    desc: 'Текст приветствия на главной странице редактируется прямо в панели администратора — без деплоя',
  },
  {
    title: 'Описания тегов',
    desc: 'Редактор пояснений к каждой теме прямо в панели. При выборе тега пользователем описание появляется над каталогом',
  },
  {
    title: 'Дайджест и уведомления',
    desc: 'Организатор получает письмо о новых записях. Виджет показывает статус последней отправки дайджеста и время следующего',
  },
  {
    title: 'Аналитика PostHog',
    desc: 'Виджет использования PostHog прямо в панели: посещаемость, уникальные пользователи, активность по дням',
  },
  {
    title: 'CI, деплой и инфра-виджеты',
    desc: 'Статус последних GitHub Actions прогонов, Vercel-деплоев и расход Neon-квоты прямо в подвале админки — не нужно открывать сторонние сайты',
  },
]

const STACK = [
  { name: 'Next.js 14', role: 'Основа приложения', desc: '«Движок» сайта — SSR/SSG страницы, App Router, API route handlers. Отвечает за скорость загрузки и связывает все части воедино' },
  { name: 'Neon Postgres', role: 'База данных', desc: 'Хранит всё: каталог книг, пользователей, сессии, приоритеты, матчинг, ленты времени, уведомления, активность. 60 миграций Drizzle. Serverless — платить только за использование. Отдельная ветка e2e изолирует тесты от прода' },
  { name: 'Drizzle ORM', role: 'Работа с БД', desc: 'Type-safe запросы к Postgres, миграции через drizzle-kit. Схема описана в TypeScript — расхождений типов быть не может' },
  { name: 'NextAuth v5', role: 'Авторизация', desc: 'Google OAuth, Email magic link, вход через Telegram-бота (deep-link + поллинг). JWT-сессии, Drizzle-адаптер для хранения аккаунтов в Postgres, привязка нескольких способов входа к одному аккаунту' },
  { name: 'Resend', role: 'Транзакционные письма', desc: 'Magic link-авторизация, дайджест-уведомления организатору, форма обратной связи. Письма уходят с домена slowreading.club' },
  { name: '@dnd-kit', role: 'Drag-and-drop', desc: 'Библиотека для сортировки книг по приоритету и в матчинге. Поддерживает мышь и тач (с задержкой активации, чтобы не конфликтовать со скроллом)' },
  { name: 'PostHog', role: 'Продуктовая аналитика', desc: 'Трекинг посещений, событий, активности пользователей. Данные видны прямо в панели администратора через виджет' },
  { name: 'Vercel', role: 'Хостинг и CI/CD', desc: 'Автодеплой при каждом мерже PR. Edge-сеть, preview-деплои для каждой feature-ветки, интегрированная аналитика' },
  { name: 'GitHub Actions', role: 'Пайплайн качества', desc: 'Два workflow: merge-gate (lint + secret scan + typecheck + unit + build, несколько минут) и ночной E2E (Playwright по cron). Codecov для coverage, Allure на GitHub Pages для E2E-отчётов' },
  { name: 'Playwright', role: 'E2E-тестирование', desc: '46 spec-файлов: авторизация, матчинг, саммари, запись на книги, профиль, ленты времени, layout-тесты и админ-сценарии. Изолированная e2e-ветка Neon, фикстуры с автоматическим cleanup' },
]

const DECISIONS = [
  {
    title: 'Postgres как единственный источник данных',
    body: 'Каталог книг раньше жил в Google Таблицах. Сейчас всё хранится в Postgres — каталог, пользователи, матчинг, очередь уведомлений. Единый источник правды упрощает транзакции, типизацию и тестирование. Организатор редактирует каталог через удобную таблицу в админке.',
  },
  {
    title: 'Реалтайм матчинга через умный polling',
    body: 'Вместо WebSocket или SSE — лёгкий polling монотонного state_version: клиент спрашивает «изменилось ли что-то?», и только при изменении тянет полное состояние. Интервал адаптируется к присутствию участников, ставится на паузу в неактивной вкладке и останавливается на замороженной сессии. Serverless-friendly: не требует постоянных соединений на Vercel.',
  },
  {
    title: 'Drag-and-drop приоритеты без глобального стейта',
    body: 'Порядок книг хранится локально в компоненте, обновляется оптимистично при перетаскивании и сохраняется через debounced PUT-запрос с задержкой 500 мс. Конкурирующие запросы безопасны — upsert на сервере принимает оба, побеждает последний.',
  },
  {
    title: 'Авторизация без пароля',
    body: 'Google OAuth, магическая ссылка на почту и Telegram — все три без паролей. Участникам не нужно ничего запоминать: сайт подсказывает последний использованный способ, а разные способы входа можно привязать к одному аккаунту.',
  },
  {
    title: 'Telegram-вход через бота, а не веб-виджет',
    body: 'Официальный Telegram Login Widget грузится с oauth.telegram.org и молча ломается в Chrome на iOS. Решение: вход через deep-link к боту — пользователь жмёт «Старт» в Telegram, а сайт поллит подтверждение и открывает сессию. Работает на любом устройстве, где установлен Telegram.',
  },
  {
    title: 'Журнал аудита на триггерах БД',
    body: 'Каждую мутацию фиксируют триггеры Postgres, а не код приложения: полнота — обязанность БД, богатый контекст (кто и откуда) — обязанность кода через обёртку withAuditContext. Забытая обёртка не теряет запись — теряется максимум имя актора, и такие записи заметны в просмотрщике. Чувствительные колонки маскируются на уровне триггера.',
  },
  {
    title: 'Немедленный разлогин при удалении администратором',
    body: 'Сессии в JWT-токенах — сервер не может их отозвать напрямую. Решение: jwt callback делает запрос к БД при каждой проверке. Удалённый пользователь получает null и автоматически выходит на следующем запросе.',
  },
  {
    title: 'Тестирование без внешних зависимостей',
    body: 'E2E-тесты не обращаются к продакшен-БД — отдельная Neon-ветка e2e + флаг NEXTAUTH_TEST_MODE включают тестовые endpoints. Три слоя изоляции: connection string, guard в lib/test-mode.ts, фикстуры с автоматическим cleanup. 14 unit-тестов на сам guard.',
  },
  {
    title: 'Раскладка ленты времени — чистые функции вне React',
    body: 'Компоненты ленты ничего не считают сами: положение точек, интервалов, кластеров, дорожек эпох и засечек линейки приходит готовым из lib/timeline. Этот код не обращается ни к БД, ни к document или canvas — браузерный измеритель ширины текста передаётся в расчёт параметром. Поэтому вся геометрия покрыта обычными unit-тестами, без запуска браузера.',
  },
  {
    title: 'Событие заводится один раз и включается в разные ленты',
    body: 'Лента — не собственный набор событий, а подборка из общего справочника. У связи «лента ↔ событие» есть своя заметка и флаг видимости, поэтому одно и то же событие может выглядеть по-разному в двух лентах. Правка общих полей видна везде — граница между «общим» и «локальным» подписана прямо в редакторе, чтобы её нельзя было перепутать.',
  },
  {
    title: 'Черновики не доезжают до гостя, а не прячутся стилями',
    body: 'Непубликованная лента отдаёт 404 всем, кроме администратора, а элементы общей базы, ещё не прикреплённые к ленте, запрашиваются только если сессия админская. Гость не получает их названия ни в HTML, ни в RSC-ответе — скрывать что-то на клиенте не приходится.',
  },
  {
    title: 'Устойчивые подписи важнее плотной раскладки',
    body: 'Положение подписи события зависит только от его даты и текущего масштаба. Панорамирование, выбор, фильтры и переключение слоёв не перекладывают события — иначе подписи прыгали бы при каждом действии. Цена: освободившиеся дорожки после фильтра не переиспользуются, а подпись у правого края обрезается полотном. Это осознанный размен, принятый владельцем.',
  },
  {
    title: 'Дайджест-очередь вместо немедленных email',
    body: 'Вместо отправки письма при каждой записи — очередь notification_queue в Postgres. Cron-job раз в сутки собирает накопленные события и отправляет один дайджест. Это снижает шум для организатора и упрощает retry-логику.',
  },
]

const DEV_APPROACH = [
  {
    title: 'Два CI-пайплайна',
    tag: 'инфраструктура',
    body: 'Merge-gate (lint + secret scan + typecheck + unit + build) выполняется за несколько минут и блокирует мерж при любой ошибке. E2E (Playwright) вынесены в ночной workflow по cron — не замедляют разработку днём. При красном ночном прогоне GitHub шлёт уведомление, чиним форвардом.',
  },
  {
    title: 'Branch protection + PR-flow',
    tag: 'workflow',
    body: 'Прямой push в main невозможен даже для администратора (enforce_admins: true). Каждое изменение — через PR с auto-merge после зелёного CI. Secret scan в каждом PR защищает от утечки ключей в публичный репо.',
  },
  {
    title: 'Observability: Allure + Codecov',
    tag: 'качество',
    body: 'Allure публикует HTML-отчёт E2E-тестов на GitHub Pages после каждого ночного прогона — видно, какой сценарий сломался и где именно. Codecov показывает покрытие unit-тестами с целевыми порогами (80% project, 70% patch).',
  },
  {
    title: 'Параллельные агенты в git worktree',
    tag: 'архитектура разработки',
    body: 'Каждая задача выполняется в изолированном git worktree от свежего main — несколько AI-агентов (Claude, Codex) работают над проектом одновременно, не мешая друг другу. Strict branch protection требует, чтобы PR был up-to-date с main перед мержем: два «зелёных по отдельности» PR не могут сломать прод вместе.',
  },
  {
    title: 'Automated quality gates',
    tag: 'редактирование',
    body: 'ESLint и TypeScript запускаются как hooks прямо во время редактирования файлов — ошибки видны до коммита. Husky + lint-staged блокируют коммит, если staged-файлы не проходят проверки: туда же входит secretlint и guard против сырых hex-цветов в разметке. После пуша — автоматический мониторинг CI с выводом ошибок.',
  },
  {
    title: 'Крупная фича — по этапам',
    tag: 'планирование',
    body: 'Раздел «Ленты времени» приехал не одним PR: сперва спецификация, затем план на каждый этап (расчётное ядро → схема и перенос данных → публичный просмотр → админка → сборка ленты), и только потом код. Каждый этап — отдельный PR со своими тестами, поэтому масштабный перенос из другого приложения ни разу не блокировал прод.',
  },
  {
    title: 'Living documentation',
    tag: 'процесс',
    body: 'CLAUDE.md — единственный источник правил для AI-агента: готчи, архитектурные решения, правила тестирования. Накапливается от сессии к сессии. GitHub Wiki синхронизируется автоматически при каждом мерже. Swagger/OpenAPI доступен на /api-docs.',
  },
]

const RESOURCES = [
  {
    title: 'GitHub Wiki',
    url: 'https://github.com/bon2362/book-club/wiki',
    desc: 'Полная документация проекта: архитектура, фичи, схема БД, внешние сервисы, операционные сценарии. Синхронизируется автоматически из docs/wiki/ при каждом мерже',
  },
  {
    title: 'Swagger / OpenAPI',
    url: 'https://www.slowreading.club/api-docs',
    desc: 'Интерактивная документация API: 77 маршрутов описаны в public/openapi.json. Админские маршруты раздела Timeline в спецификацию пока не внесены',
  },
  {
    title: 'Allure E2E-отчёт',
    url: 'https://bon2362.github.io/book-club',
    desc: 'HTML-отчёт Playwright после ночного прогона: сценарии по областям, трейсы упавших тестов, история запусков',
  },
  {
    title: 'Codecov',
    url: 'https://codecov.io/gh/bon2362/book-club',
    desc: 'Покрытие unit-тестами по файлам и строкам. Обновляется при каждом PR',
  },
  {
    title: 'GitHub repo',
    url: 'https://github.com/bon2362/book-club',
    desc: 'Исходный код, Issues (бэклог), Pull Requests, Actions. Ведётся как полноценный проект с labels и milestone',
  },
  {
    title: 'Дизайн-система',
    url: 'https://www.slowreading.club/styleguide',
    desc: 'Живая витрина: кнопки, инпуты, карточки, чипы, типографика. Единственный источник правды по токенам и примитивам — всё новое копируется отсюда',
  },
]

const STATS = [
  { value: '~45 000', label: 'строк кода без тестов' },
  { value: '97', label: 'API-маршрутов' },
  { value: '1809', label: 'unit-тестов' },
  { value: '46', label: 'E2E-спецификаций' },
]

const CODE_ROWS = [
  { category: 'UI-компоненты и страницы (drawer, карточки, формы, полотно ленты)', lines: 25000 },
  { category: 'API-маршруты', lines: 6400 },
  { category: 'Тесты (unit + E2E)', lines: 37000 },
  { category: 'Бизнес-логика (auth, матчинг, таймлайн, аудит, БД, email)', lines: 12700 },
  { category: 'Конфигурация и скрипты', lines: 900 },
]
