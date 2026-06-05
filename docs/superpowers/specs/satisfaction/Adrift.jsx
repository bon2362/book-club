/* Adrift banner — softened for satisfaction mode (spec §6).
   In satisfaction, being out of a circle is normal by design, so the banner
   drops the alarm register: calmer surface (warm chip tint instead of warning
   orange), info dot instead of ⚠, reassuring copy, gentler CTA. The coverage
   version is shown beside it for contrast. */

function AdriftBanner({ variant }) {
  const soft = variant === 'satisfaction';

  // Surface + accent swap by variant
  const surface = soft ? 'var(--bg-input)' : 'var(--status-warn-soft)';
  const borderCol = soft ? 'var(--hair)' : 'color-mix(in srgb, var(--status-warn) 30%, transparent)';
  const leftBar = soft ? 'var(--accent)' : 'var(--status-warn)';
  const ctaBg = soft ? 'var(--accent)' : 'var(--status-warn)';

  return (
    <section style={{
      background: surface, border: `1px solid ${borderCol}`, borderLeft: `3px solid ${leftBar}`,
      borderRadius: 'var(--radius-card)', padding: '1rem 1.15rem',
      boxShadow: '0 1px 2px rgba(50,38,24,.05), 0 6px 18px rgba(50,38,24,.05)',
      display: 'flex', gap: '0.95rem', alignItems: 'flex-start',
    }}>
      {/* Icon — info dot (soft) vs warning triangle (coverage) */}
      {soft ? (
        <span aria-hidden="true" style={{
          width: 22, height: 22, borderRadius: '50%', flexShrink: 0, marginTop: '0.1rem',
          background: 'var(--accent-soft)', color: 'var(--accent)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--nd-serif)', fontWeight: 700, fontSize: '0.85rem',
        }}>i</span>
      ) : (
        <span aria-hidden="true" style={{ fontSize: '1.4rem', color: 'var(--status-warn)', flexShrink: 0, lineHeight: 1, marginTop: '0.18rem' }}>⚠</span>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.9rem', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontFamily: 'var(--nd-serif)', fontSize: '1.22rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
              {soft ? 'Вы пока не в круге' : 'Вы за бортом'}
            </h2>
            <p style={{ margin: '0.3rem 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5, maxWidth: '64ch' }}>
              {soft
                ? 'В этом режиме круги собираются по самому близкому совпадению интересов — и не все попадают сразу. Это нормально: посмотрите, что выбирают другие, поднимите свою книгу выше или дождитесь новых участников.'
                : 'В лучшем сейчас сценарии для вас не собирается читательский круг — вы не попадаете ни в одну группу.'}
            </p>
            {soft && (
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                Ваши приоритеты учтены — вы в подборе. Просто пока не нашлось круга с вашими книгами.
              </p>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.4rem', flexShrink: 0 }}>
            <button style={{
              padding: '0.5rem 1rem', border: 'none', borderRadius: 'var(--radius)',
              background: ctaBg, color: 'var(--bg-input)', fontFamily: 'var(--nd-sans)',
              fontWeight: 600, fontSize: '0.84rem', cursor: 'pointer', whiteSpace: 'nowrap',
              borderRadius: soft ? 'var(--radius-control)' : 'var(--radius)',
            }}>
              {soft ? 'Где совпадают интересы →' : 'Как вернуться в круг →'}
            </button>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {soft ? 'подсказки в «Моих ходах»' : 'добавьте книгу из «Моих ходов»'}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function AdriftCompare() {
  return (
    <div style={{ background: 'var(--bg)', padding: '1.4rem 1.5rem', minHeight: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
        <div>
          <div style={{ ...microLabel, marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Сейчас · режим «покрытие»</div>
          <AdriftBanner variant="coverage" />
        </div>
        <div>
          <div style={{ ...microLabel, marginBottom: '0.5rem', color: 'var(--accent)' }}>Смягчённый · режим «удовлетворённость»</div>
          <AdriftBanner variant="satisfaction" />
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { AdriftBanner, AdriftCompare });
