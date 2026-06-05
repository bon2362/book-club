/* Shared primitives + sample data for the satisfaction-mode mockups.
   Faithful to book-club/components/nd/*: CoverImage fallback, ParticipantInterestChip,
   matching-shared.interestLabel. */

// ── Cover (CSS-drawn fallback — covers come from external URLs in prod) ──────
// Mirrors CoverImage.tsx fallback: warm bg-elevated + author initials, but we
// add a spine + serif title so mock covers read as books.
function CoverMock({ title, author, w = 42, h = 60, hue }) {
  const palette = [
    ['#7C4A3A', '#FBF3E7'], ['#3C5A4E', '#F4EFE2'], ['#5B4B7A', '#F3EEE6'],
    ['#8A6A2F', '#FBF4E4'], ['#3F5468', '#EEF1F4'], ['#7A3B45', '#F8ECEC'],
    ['#4A6356', '#EFF3EE'], ['#6E5326', '#F7F0DE'],
  ];
  const [bg, fg] = palette[(hue ?? title.length) % palette.length];
  return (
    <div
      aria-label={`Обложка: ${title}`}
      style={{
        width: w, height: h, borderRadius: 4, flexShrink: 0, position: 'relative',
        overflow: 'hidden', background: bg, boxShadow: '0 1px 3px rgba(40,30,20,0.18)',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'rgba(0,0,0,0.18)' }} />
      <div style={{
        padding: w > 50 ? '6px 7px' : '4px 5px',
        fontFamily: 'var(--nd-serif)', fontWeight: 700, color: fg,
        fontSize: w > 50 ? '0.62rem' : '0.5rem', lineHeight: 1.12,
        textShadow: '0 1px 2px rgba(0,0,0,0.25)',
        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {title}
      </div>
    </div>
  );
}

// ── interestLabel (matching-shared.ts, verbatim logic) ───────────────────────
function interestLabel(rank) {
  if (rank == null) return 'без ранга';
  if (rank <= 3) return 'очень хочу';
  return 'хочу';
}
function isStrongInterest(rank) { return rank != null && rank <= 3; }

// ── ParticipantInterestChip (faithful to ParticipantInterestChip.tsx) ────────
function InterestChip({ pseudonym, rank, isMe = false, showLabel = true }) {
  const strong = isStrongInterest(rank);
  return (
    <span className="nd-chip-text" style={{
      display: 'inline-flex', alignItems: 'baseline', gap: '0.25rem',
      fontSize: '0.78rem', color: 'var(--text-secondary)',
    }}>
      <b style={{ fontWeight: isMe ? 700 : 500, color: strong ? 'var(--accent)' : 'inherit' }}>
        {pseudonym}{isMe ? ' · вы' : ''}
      </b>
      {showLabel && (
        <span style={{ fontSize: '0.72rem', color: strong ? 'var(--accent)' : 'var(--text-muted)', opacity: strong ? 0.85 : 1 }}>
          {interestLabel(rank)}
        </span>
      )}
    </span>
  );
}

// ── Microlabel (admin uppercase eyebrow) ─────────────────────────────────────
const microLabel = {
  fontFamily: 'var(--nd-sans)', textTransform: 'uppercase', letterSpacing: '0.13em',
  fontSize: '0.6rem', color: 'var(--text-muted)',
};

// ── Sample data — nature pseudonyms (fits «Долгое наступление» theme) ─────────
const BOOKS = {
  solaris:   { title: 'Солярис',                 author: 'Станислав Лем' },
  steppe:    { title: 'Степной волк',            author: 'Герман Гессе' },
  master:    { title: 'Мастер и Маргарита',      author: 'Михаил Булгаков' },
  pestilence:{ title: 'Чума',                    author: 'Альбер Камю' },
  norwegian: { title: 'Норвежский лес',          author: 'Харуки Мураками' },
  shantaram: { title: 'Дом, в котором…',         author: 'Мариам Петросян' },
  metro:     { title: 'Сто лет одиночества',     author: 'Г. Г. Маркес' },
  picnic:    { title: 'Пикник на обочине',       author: 'А. и Б. Стругацкие' },
};

Object.assign(window, { CoverMock, InterestChip, interestLabel, isStrongInterest, microLabel, BOOKS });
