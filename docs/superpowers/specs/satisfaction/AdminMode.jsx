/* Admin: «Режим подбора» selector inside the real create-session form.
   Monospace register, sharp corners, hairline borders, bottom-border inputs —
   faithful to AdminMatchingSession.tsx. The selector is the new field. */

const _fieldInput = {
  fontFamily: 'var(--nd-mono)', fontSize: '0.8rem', border: 'none',
  borderBottom: '1px solid var(--border)', outline: 'none', padding: '2px 0',
  background: 'transparent', width: '100%', color: 'var(--text)',
};
const _btn = {
  fontFamily: 'var(--nd-mono)', fontSize: '0.75rem', border: '1px solid var(--border)',
  background: 'none', padding: '4px 10px', cursor: 'pointer', borderRadius: 'var(--radius)',
};
const _fieldLabel = { display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 2 };

const MODES = [
  {
    id: 'coverage',
    name: 'Покрытие',
    tag: 'по умолчанию',
    line: 'Собрать в группы как можно больше участников. Сценарии ранжируются по охвату — текущее поведение.',
  },
  {
    id: 'satisfaction',
    name: 'Удовлетворённость',
    tag: 'новый',
    line: 'Сначала качество совпадений: лучшие круги по интересам, даже если кто-то останется без группы.',
  },
];

function ModeOption({ mode, selected, onSelect }) {
  const accent = mode.id === 'satisfaction' ? 'var(--accent)' : 'var(--success)';
  return (
    <div
      className="mode-opt"
      role="radio"
      aria-checked={selected}
      onClick={() => onSelect(mode.id)}
      style={{
        display: 'flex', gap: '0.6rem', padding: '0.6rem 0.75rem',
        background: selected ? 'var(--bg)' : 'var(--bg-input)',
        borderLeft: `2px solid ${selected ? accent : 'transparent'}`,
      }}
    >
      {/* Square radio indicator — sharp corners, editorial */}
      <span aria-hidden="true" style={{
        width: 13, height: 13, marginTop: 2, flexShrink: 0,
        border: `1.5px solid ${selected ? accent : 'var(--text-muted)'}`,
        background: 'var(--bg-input)', display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center',
      }}>
        {selected && <span style={{ width: 6, height: 6, background: accent }} />}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--nd-mono)', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>
            {mode.name}
          </span>
          <span style={{
            ...microLabel,
            color: selected ? accent : 'var(--text-muted)',
            fontSize: '0.56rem',
          }}>
            {mode.tag}
          </span>
        </div>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.72rem', lineHeight: 1.45, color: 'var(--text-secondary)' }}>
          {mode.line}
        </p>
        {/* Satisfaction reveals what changes — keeps the non-obvious behaviour visible at decision time */}
        {mode.id === 'satisfaction' && selected && (
          <ul style={{
            margin: '0.5rem 0 0', padding: 0, listStyle: 'none',
            display: 'flex', flexDirection: 'column', gap: '0.2rem',
          }}>
            {[
              'Перед доской участник проходит экран ранжирования.',
              'Без ранга участник не попадает в подбор.',
              'Зафиксируется при создании, без переключения потом.',
            ].map((t) => (
              <li key={t} style={{ display: 'flex', gap: '0.4rem', fontSize: '0.68rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                <span style={{ color: accent, flexShrink: 0 }}>→</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AdminCreateSession() {
  const [mode, setMode] = React.useState('satisfaction');
  return (
    <div style={{ fontFamily: 'var(--nd-mono)', fontSize: '0.82rem', background: 'var(--bg)', padding: '1.4rem 1.5rem' }}>
      <div style={{ fontWeight: 600, marginBottom: '0.9rem', color: 'var(--text)' }}>
        Создать новую сессию
      </div>

      <form onSubmit={(e) => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', maxWidth: 400 }}>
        <div>
          <label style={_fieldLabel}>Название *</label>
          <input defaultValue="Июньская встреча" style={_fieldInput} />
        </div>

        <div>
          <label style={_fieldLabel}>Размер группы</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>от</span>
            <input defaultValue="3" style={{ ..._fieldInput, width: 60 }} />
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>до</span>
            <input defaultValue="4" style={{ ..._fieldInput, width: 60 }} />
          </div>
        </div>

        <div>
          <label style={_fieldLabel}>Дедлайн (опционально)</label>
          <input defaultValue="2026-06-20T19:00" style={_fieldInput} />
        </div>

        {/* ── NEW FIELD: Режим подбора ── */}
        <div>
          <label style={_fieldLabel}>Режим подбора</label>
          <div role="radiogroup" aria-label="Режим подбора" style={{
            border: '1px solid var(--border)',
            borderBottom: '2px solid var(--border-strong)',
            borderRadius: 'var(--radius)', overflow: 'hidden',
          }}>
            {MODES.map((m, i) => (
              <React.Fragment key={m.id}>
                {i > 0 && <div style={{ height: 1, background: 'var(--border)' }} />}
                <ModeOption mode={m} selected={mode === m.id} onSelect={setMode} />
              </React.Fragment>
            ))}
          </div>
        </div>

        <button type="submit" style={{ ..._btn, alignSelf: 'flex-start', marginTop: '0.2rem' }}>
          Создать сессию
        </button>
      </form>
    </div>
  );
}

Object.assign(window, { AdminCreateSession });
