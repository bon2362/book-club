import type { CSSProperties } from 'react'

export const metadata = { title: 'Дизайн-система — Долгое наступление' }

/**
 * /styleguide — живая витрина дизайн-системы.
 * Источник правды по значениям — app/globals.css (:root).
 * Эта страница НЕ объявляет своих цветов: всё через var(--…).
 * Любой компонент должен выглядеть так же, как примитивы ниже.
 */

const serif = 'var(--nd-serif)'
const sans  = 'var(--nd-sans)'
const mono  = 'var(--nd-mono)'

function Eyebrow({ children, style }: { children: React.ReactNode; style?: CSSProperties }) {
  return (
    <p style={{ fontFamily: sans, fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-muted)', margin: 0, ...style }}>
      {children}
    </p>
  )
}

function SecHead({ num, title, note }: { num: string; title: string; note?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.8rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.6rem', marginBottom: '1.6rem' }}>
      <span style={{ fontFamily: sans, fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-muted)' }}>{num}</span>
      <h2 style={{ fontFamily: serif, fontWeight: 700, fontSize: '1.35rem', letterSpacing: '-0.01em', margin: 0 }}>{title}</h2>
      {note && <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>{note}</span>}
    </div>
  )
}

const SWATCHES: Array<{ nm: string; hex: string; use: string; light?: boolean }> = [
  { nm: 'text',          hex: '#111111', use: 'основной текст' },
  { nm: 'text-body',     hex: '#333333', use: 'длинный текст' },
  { nm: 'text-secondary',hex: '#666666', use: 'авторы, подписи' },
  { nm: 'text-muted',    hex: '#999999', use: 'мета, плейсхолдеры' },
  { nm: 'bg',            hex: '#FFFFFF', use: 'фон страницы', light: true },
  { nm: 'bg-elevated',   hex: '#FAFAFA', use: 'разделители, шапки', light: true },
  { nm: 'accent',        hex: '#C0603A', use: 'терракота: статусы, акценты' },
  { nm: 'success',       hex: '#2D6A4F', use: '«записаться», ок' },
  { nm: 'border',        hex: '#E5E5E5', use: 'хайрлайн, рамки', light: true },
  { nm: 'border-strong', hex: '#111111', use: 'сильная линия 2px' },
]

const btn: CSSProperties = {
  fontFamily: sans, fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em',
  padding: '0.55rem 1.1rem', borderRadius: 'var(--radius)', cursor: 'pointer',
  border: '1px solid var(--border-strong)', background: 'var(--text)', color: 'var(--bg)',
}
const chip: CSSProperties = {
  fontFamily: sans, fontSize: '0.68rem', padding: '0.14rem 0.55rem', borderRadius: 'var(--radius)',
  border: '1px solid var(--border)', color: 'var(--text-secondary)', background: 'transparent', whiteSpace: 'nowrap',
}
const tier: CSSProperties = {
  fontFamily: sans, fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.12em',
  padding: '0 0 1px', borderBottom: '1px solid currentColor',
}
const card: CSSProperties = { border: '1px solid var(--border)', background: 'var(--bg-input)', padding: '1rem' }

export default function StyleguidePage() {
  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', fontFamily: sans, minHeight: '100vh' }}>
      <header style={{ borderBottom: '2px solid var(--border-strong)' }}>
        <div style={{ maxWidth: 1040, margin: '0 auto', padding: '2.4rem 2rem 1.8rem' }}>
          <Eyebrow style={{ marginBottom: '0.7rem' }}>Читательские круги · дизайн-система</Eyebrow>
          <h1 style={{ fontFamily: serif, fontWeight: 700, fontSize: '2.4rem', letterSpacing: '-0.02em', margin: 0 }}>Долгое наступление</h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: '0.7rem 0 0', maxWidth: '60ch', lineHeight: 1.6 }}>
            Один визуальный язык на весь сайт. Белый редакторский стиль — острые углы, тонкие линии,
            Georgia для заголовков, терракотовый акцент. Значения — токены из <code style={{ fontFamily: mono }}>app/globals.css</code>.
          </p>
        </div>
      </header>

      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '0 2rem 6rem' }}>

        {/* COLOR */}
        <section style={{ padding: '3rem 0 0' }}>
          <SecHead num="01" title="Цвет" note="значения = globals.css :root" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 1, background: 'var(--border)', border: '1px solid var(--border)' }}>
            {SWATCHES.map((s) => (
              <div key={s.nm} style={{ background: 'var(--bg)' }}>
                <div style={{ height: 64, background: s.hex, borderBottom: s.light ? '1px solid var(--border)' : 'none' }} />
                <div style={{ padding: '0.55rem 0.7rem' }}>
                  <div style={{ fontSize: '0.74rem', fontWeight: 600 }}>{s.nm}</div>
                  <div style={{ fontFamily: mono, fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>{s.hex}</div>
                  <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: '0.25rem', lineHeight: 1.4 }}>{s.use}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* TYPE */}
        <section style={{ padding: '3rem 0 0' }}>
          <SecHead num="02" title="Типографика" note="Georgia · system-ui" />
          {[
            { spec: 'Display — Georgia 700 · 2.2rem', node: <span style={{ fontFamily: serif, fontWeight: 700, fontSize: '2.2rem', letterSpacing: '-0.02em' }}>Долгое наступление</span> },
            { spec: 'Eyebrow — system-ui · 0.6rem · UPPER', node: <Eyebrow style={{ letterSpacing: '0.15em' }}>Читательские круги</Eyebrow> },
            { spec: 'H1 — Georgia 700 · 1.4rem', node: <span style={{ fontFamily: serif, fontWeight: 700, fontSize: '1.4rem', letterSpacing: '-0.02em' }}>Записывайтесь на совместное чтение</span> },
            { spec: 'Книга H2 — Georgia 700 · 1.05rem', node: <span style={{ fontFamily: serif, fontWeight: 700, fontSize: '1.05rem', letterSpacing: '-0.01em' }}>Заря всего</span> },
            { spec: 'Body — system-ui · 0.875rem · body', node: <span style={{ fontFamily: sans, fontSize: '0.875rem', color: 'var(--text-body)', lineHeight: 1.55 }}>Каждый месяц мы выбираем книгу и читаем её небольшими кругами.</span> },
            { spec: 'Meta — system-ui · 0.7rem · muted', node: <span style={{ fontFamily: sans, fontSize: '0.7rem', color: 'var(--text-muted)' }}>384 стр. · 2021</span> },
          ].map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '1.5rem', padding: '1rem 0', borderBottom: '1px solid var(--border-subtle)', alignItems: 'baseline' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{r.spec}</div>
              <div>{r.node}</div>
            </div>
          ))}
        </section>

        {/* PRIMITIVES */}
        <section style={{ padding: '3rem 0 0' }}>
          <SecHead num="03" title="Примитивы" note="копировать отсюда" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '1.4rem' }}>

            <div style={{ border: '1px solid var(--border)', padding: '1.2rem' }}>
              <Eyebrow style={{ marginBottom: '0.9rem' }}>Кнопки</Eyebrow>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                <button style={btn}>Активная</button>
                <button style={{ ...btn, background: 'var(--accent)', borderColor: 'var(--accent)' }}>Акцент</button>
                <button style={{ ...btn, background: 'var(--success)', borderColor: 'var(--success)' }}>Хочу читать</button>
              </div>
            </div>

            <div style={{ border: '1px solid var(--border)', padding: '1.2rem' }}>
              <Eyebrow style={{ marginBottom: '0.9rem' }}>Поле ввода</Eyebrow>
              <input placeholder="Поиск…" style={{ fontFamily: sans, fontSize: '0.8rem', color: 'var(--text)', background: 'var(--bg-input)', border: '1px solid var(--border)', borderBottom: '2px solid var(--border-strong)', padding: '0.45rem 0.6rem', outline: 'none', width: '100%' }} />
            </div>

            <div style={{ border: '1px solid var(--border)', padding: '1.2rem' }}>
              <Eyebrow style={{ marginBottom: '0.9rem' }}>Чипсы</Eyebrow>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                <span style={chip}>тег</span>
                <span style={{ ...chip, background: 'var(--text)', color: 'var(--bg)', borderColor: 'var(--text)' }}>активный</span>
                <span style={chip}>Медведка</span>
                <span style={chip}>Зяблик <span style={{ color: 'var(--text-muted)' }}>· хочу читать</span></span>
              </div>
            </div>

            <div style={{ border: '1px solid var(--border)', padding: '1.2rem' }}>
              <Eyebrow style={{ marginBottom: '0.9rem' }}>Метки и статусы</Eyebrow>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
                <span style={{ ...tier, color: 'var(--accent)' }}>лидер</span>
                <span style={{ ...tier, color: 'var(--text-muted)' }}>макс. покрытие</span>
                <span style={{ fontFamily: sans, fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--accent)', borderBottom: '1px solid var(--accent)', paddingBottom: '0.1rem' }}>Сейчас читаем</span>
              </div>
            </div>

            <div style={{ ...card, gridColumn: '1/-1', borderTop: '2px solid var(--border-strong)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <h3 style={{ fontFamily: serif, fontWeight: 700, fontSize: '0.98rem', letterSpacing: '-0.01em', margin: 0 }}>Заря всего</h3>
                <span style={{ ...tier, color: 'var(--accent)' }}>лидер</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                <span style={chip}>Медведка <span style={{ color: 'var(--text-muted)' }}>· без ранга</span></span>
                <span style={chip}>Зяблик <span style={{ color: 'var(--text-muted)' }}>· готов(а)</span></span>
                <span style={chip}>Соболь <span style={{ color: 'var(--text-muted)' }}>· хочу читать</span></span>
              </div>
            </div>

          </div>
        </section>

      </div>
    </div>
  )
}
