/* MatchingRankingGate — intermediate screen shown in satisfaction mode before
   the board (joined, no ranks yet). Reuses MatchingPersonalList primitives:
   «Остальной каталог» + «Мои книги» (drag to rank) + CTA «Войти в подбор».
   CTA enabled at ≥1 ranked active book (spec §4). */

const _panel = {
  background: 'var(--bg-input)', borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--shadow-card)', display: 'flex', flexDirection: 'column',
  overflow: 'hidden',
};
const _panelHead = { padding: '0.85rem 1.25rem 0.6rem', flexShrink: 0 };
const _rowBase = {
  display: 'grid', gridTemplateColumns: '30px 40px 1fr', gap: '0.75rem',
  padding: '0.6rem 0.75rem', alignItems: 'center', cursor: 'pointer',
};
const _titleStyle = {
  fontFamily: 'var(--nd-serif)', fontWeight: 700, fontSize: '0.92rem',
  letterSpacing: '-0.01em', color: 'var(--text)', overflow: 'hidden',
  textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.25, marginBottom: '0.05rem',
};
const _authorStyle = { fontSize: '0.76rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

function PanelHead({ title, sub }) {
  return (
    <div style={_panelHead}>
      <h3 style={{ margin: 0, fontFamily: 'var(--nd-serif)', fontSize: '1rem', fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text)' }}>{title}</h3>
      <p style={{ margin: '0.15rem 0 0', fontSize: '0.74rem', color: 'var(--text-muted)' }}>{sub}</p>
    </div>
  );
}

function CoSignups({ names }) {
  if (!names || names.length === 0) return null;
  return (
    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '0.12rem' }}>
      <span style={{ opacity: 0.7 }}>тоже записались: </span>
      <span style={{ color: 'var(--text-secondary)' }}>{names.join(' · ')}</span>
    </div>
  );
}

function CatalogRow({ book, isFirst, hovered }) {
  return (
    <li className="nd-catalog-row" style={{ ..._rowBase, boxShadow: isFirst ? 'none' : 'inset 0 1px 0 var(--hair-soft)', background: hovered ? '#FAF6EE' : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <span style={{ fontSize: '1.1rem', color: 'var(--text-muted)', opacity: 0.45 }}>+</span>
      </div>
      <CoverMock title={book.title} author={book.author} w={40} h={57} hue={book.hue} />
      <div style={{ minWidth: 0, position: 'relative' }}>
        <div style={_titleStyle}>{book.title}</div>
        <div style={_authorStyle}>{book.author}</div>
        {hovered && (
          <button style={{
            position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
            background: 'var(--accent)', color: 'var(--bg-input)', border: 'none',
            borderRadius: 'var(--radius-control)', fontSize: '0.74rem', fontWeight: 600,
            padding: '0.4rem 0.8rem', cursor: 'pointer',
          }}>Хочу читать</button>
        )}
      </div>
    </li>
  );
}

function SortableRow({ book, index, isFirst, hovered }) {
  return (
    <li className="nd-catalog-row" style={{ ..._rowBase, boxShadow: isFirst ? 'none' : 'inset 0 1px 0 var(--hair-soft)', background: hovered ? '#FAF6EE' : undefined }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.1rem' }}>
        <span style={{ fontFamily: 'var(--nd-serif)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-secondary)', lineHeight: 1 }}>#{index + 1}</span>
        <span className="nd-drag-handle" style={{ color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1, cursor: 'grab' }}>⠿</span>
      </div>
      <CoverMock title={book.title} author={book.author} w={40} h={57} hue={book.hue} />
      <div style={{ minWidth: 0, position: 'relative' }}>
        <div style={_titleStyle}>{book.title}</div>
        <div style={_authorStyle}>{book.author}</div>
        <CoSignups names={book.coSignups} />
        {hovered && (
          <button style={{
            position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
            background: 'var(--chip-bg)', color: 'var(--text-secondary)', border: 'none',
            borderRadius: 'var(--radius-control)', fontSize: '0.74rem', fontWeight: 600,
            padding: '0.4rem 0.8rem', cursor: 'pointer',
          }}>Убрать из списка</button>
        )}
      </div>
    </li>
  );
}

function EmptyColumn({ text }) {
  return (
    <div style={{ minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
      <p style={{ fontSize: '0.86rem', lineHeight: 1.6, margin: 0 }}>{text}</p>
    </div>
  );
}

/* state: 'empty' (CTA disabled) | 'ranked' (CTA enabled) */
function RankingGate({ state = 'ranked' }) {
  const ranked = state === 'ranked';
  const catalog = [
    { ...BOOKS.steppe, hue: 1 }, { ...BOOKS.master, hue: 2 },
    { ...BOOKS.pestilence, hue: 5 }, { ...BOOKS.norwegian, hue: 4 },
    { ...BOOKS.metro, hue: 6 },
  ];
  const mine = ranked ? [
    { ...BOOKS.solaris, hue: 0, coSignups: ['Зимородок', 'Барсук'] },
    { ...BOOKS.picnic, hue: 7, coSignups: ['Рысь'] },
    { ...BOOKS.shantaram, hue: 3 },
  ] : [];

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100%', padding: '2rem 2.2rem 0', position: 'relative' }}>
      {/* faint editorial baseline grid, as in MatchingWelcome */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'linear-gradient(var(--hair-soft) 1px, transparent 1px)',
        backgroundSize: '100% 2.1rem', opacity: 0.5, pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', maxWidth: 880, margin: '0 auto' }}>
        {/* ── Intro ── */}
        <div style={{ maxWidth: 620 }}>
          <div style={{ ...microLabel, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)' }} />
            Режим: удовлетворённость · шаг перед доской
          </div>
          <h1 style={{ margin: '0.7rem 0 0', fontFamily: 'var(--nd-serif)', fontSize: '1.85rem', lineHeight: 1.14, fontWeight: 700, color: 'var(--text)' }}>
            Сначала расставьте приоритеты
          </h1>
          <p style={{ margin: '0.7rem 0 0', fontFamily: 'var(--nd-serif)', fontSize: '1.02rem', lineHeight: 1.55, color: 'var(--text-body)' }}>
            В этой сессии круги собираются по тому, что вы хотите читать <em style={{ color: 'var(--accent)' }}>сильнее всего</em>.
            Добавьте книги в список и перетащите их по важности. После этого вы войдёте в подбор —
            без приоритетов вас пока не учитывают.
          </p>
        </div>

        {/* ── Two-column catalog + my books (board layout) ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.18fr) minmax(0,0.82fr)', gap: '1.1rem', marginTop: '1.6rem' }}>
          <section style={_panel}>
            <PanelHead title="Остальной каталог" sub="Наведите на книгу и добавьте её в список" />
            <div style={{ padding: '0 0.5rem 0.5rem' }}>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {catalog.map((b, i) => <CatalogRow key={b.title} book={b} isFirst={i === 0} hovered={i === 0} />)}
              </ul>
            </div>
          </section>

          <section style={_panel}>
            <PanelHead title="Мои книги" sub="Перетащите, чтобы задать приоритет" />
            <div style={{ padding: '0 0.5rem' }}>
              {ranked ? (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {mine.map((b, i) => <SortableRow key={b.title} book={b} index={i} isFirst={i === 0} hovered={i === 1} />)}
                </ul>
              ) : (
                <EmptyColumn text="Здесь появятся книги, которые вы добавили. Добавьте хотя бы одну, чтобы войти в подбор." />
              )}
            </div>
          </section>
        </div>

        {/* ── Sticky-style CTA footer ── */}
        <div style={{
          position: 'sticky', bottom: 0, marginTop: '1.4rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
          flexWrap: 'wrap', padding: '1rem 0 1.6rem',
        }}>
          <p style={{ margin: 0, fontSize: '0.82rem', color: ranked ? 'var(--text-secondary)' : 'var(--text-muted)', lineHeight: 1.5, maxWidth: '46ch' }}>
            {ranked
              ? <>Приоритеты сохраняются автоматически. Когда будете готовы — <strong style={{ color: 'var(--text)' }}>войдите в подбор</strong>, и доска со сценариями откроется.</>
              : 'Добавьте хотя бы одну книгу в список, чтобы кнопка стала активной.'}
          </p>
          <button
            className="gate-cta"
            disabled={!ranked}
            style={{
              padding: '0.85rem 1.5rem', border: 'none', borderRadius: 'var(--radius-control)',
              background: ranked ? 'var(--accent)' : 'var(--border)',
              color: ranked ? 'var(--bg-input)' : 'var(--text-muted)',
              fontFamily: 'var(--nd-sans)', fontSize: '0.92rem', fontWeight: 700,
              letterSpacing: '0.04em', cursor: ranked ? 'pointer' : 'default',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            Войти в подбор →
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { RankingGate });
