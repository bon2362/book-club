/* Satisfaction scenarios — neutral «Сценарий 1…N» (spec §6).
   Differences from coverage MatchingScenarios.tsx:
   • no «лучший сейчас» badge, no accent-soft leader background — equal weight,
     order is just deterministic output, not a verdict;
   • primary metric is circle quality (средний ранг), coverage shown muted;
   • viewer in «за бортом» is not alarm-styled (that's the softened adrift banner). */

function CircleRow({ book, members, isFirst }) {
  return (
    <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'flex-start', padding: '0.55rem 0', borderTop: isFirst ? 'none' : '1px solid var(--hair-soft)' }}>
      <CoverMock title={book.title} author={book.author} w={42} h={60} hue={book.hue} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--nd-serif)', fontWeight: 700, fontSize: '1rem', letterSpacing: '-0.01em', color: 'var(--text)', lineHeight: 1.3 }}>
          {book.title}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: '0.4rem', gap: '0.3rem 0.55rem' }}>
          {members.map((m) => (
            <InterestChip key={m.pseudonym} pseudonym={m.pseudonym} rank={m.rank} isMe={m.isMe} />
          ))}
        </div>
      </div>
    </div>
  );
}

function QualityPill({ children }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.28rem',
      fontSize: '0.7rem', fontWeight: 600, padding: '0.16rem 0.5rem',
      borderRadius: 'var(--radius-pill)', background: 'var(--chip-bg)', color: 'var(--text-secondary)',
    }}>{children}</span>
  );
}

function ScenarioCard({ scenario, number }) {
  return (
    <li style={{
      background: 'var(--bg-input)', borderRadius: 'var(--radius-card)',
      boxShadow: '0 1px 2px rgba(50,38,24,.04)', padding: '0.85rem 1rem',
    }}>
      {/* Neutral header — no «лучший» framing */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.55rem', marginBottom: '0.7rem' }}>
        <h3 style={{ margin: 0, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>
          Сценарий {number}
        </h3>
        <QualityPill>средний ранг {scenario.avgRank.toFixed(1)}</QualityPill>
        <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          охват: {scenario.covered} из {scenario.total}
        </span>
      </div>

      <div>
        {scenario.circles.map((c, i) => (
          <CircleRow key={c.book.title} book={c.book} members={c.members} isFirst={i === 0} />
        ))}
      </div>

      {scenario.leftOut.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.25rem', marginTop: '0.7rem', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
          <span>Пока без круга:</span>
          {scenario.leftOut.map((p, i) => (
            <span key={p.pseudonym} style={{ color: p.isMe ? 'var(--text-secondary)' : 'var(--text-secondary)', fontWeight: p.isMe ? 700 : 400 }}>
              {i > 0 && <span style={{ color: 'var(--hair)', margin: '0 0.2rem' }}>·</span>}
              {p.pseudonym}{p.isMe ? ' · вы' : ''}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

function SatisfactionScenarios() {
  const scenarios = [
    {
      avgRank: 1.0, covered: 6, total: 9,
      circles: [
        { book: { ...BOOKS.solaris, hue: 0 }, members: [
          { pseudonym: 'Зимородок', rank: 1 }, { pseudonym: 'Барсук', rank: 1 }, { pseudonym: 'Выхухоль', rank: 2, isMe: true },
        ]},
        { book: { ...BOOKS.picnic, hue: 7 }, members: [
          { pseudonym: 'Рысь', rank: 1 }, { pseudonym: 'Филин', rank: 1 }, { pseudonym: 'Куница', rank: 2 },
        ]},
      ],
      leftOut: [{ pseudonym: 'Сойка' }, { pseudonym: 'Бобр' }, { pseudonym: 'Горностай' }],
    },
    {
      avgRank: 1.5, covered: 6, total: 9,
      circles: [
        { book: { ...BOOKS.solaris, hue: 0 }, members: [
          { pseudonym: 'Зимородок', rank: 1 }, { pseudonym: 'Барсук', rank: 1 }, { pseudonym: 'Выхухоль', rank: 2, isMe: true },
        ]},
        { book: { ...BOOKS.steppe, hue: 1 }, members: [
          { pseudonym: 'Сойка', rank: 2 }, { pseudonym: 'Бобр', rank: 2 }, { pseudonym: 'Горностай', rank: 1 },
        ]},
      ],
      leftOut: [{ pseudonym: 'Рысь' }, { pseudonym: 'Филин' }, { pseudonym: 'Куница' }],
    },
    {
      avgRank: 2.3, covered: 9, total: 9,
      circles: [
        { book: { ...BOOKS.solaris, hue: 0 }, members: [
          { pseudonym: 'Зимородок', rank: 1 }, { pseudonym: 'Выхухоль', rank: 2, isMe: true }, { pseudonym: 'Сойка', rank: 4 },
        ]},
        { book: { ...BOOKS.picnic, hue: 7 }, members: [
          { pseudonym: 'Рысь', rank: 1 }, { pseudonym: 'Филин', rank: 1 }, { pseudonym: 'Барсук', rank: 4 },
        ]},
        { book: { ...BOOKS.master, hue: 2 }, members: [
          { pseudonym: 'Куница', rank: 3 }, { pseudonym: 'Бобр', rank: 3 }, { pseudonym: 'Горностай', rank: 4 },
        ]},
      ],
      leftOut: [],
    },
  ];

  return (
    <div style={{ background: 'var(--bg)', padding: '1.1rem 1.2rem', minHeight: '100%' }}>
      {/* Panel heading as on the board */}
      <div style={{ marginBottom: '0.2rem' }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--nd-serif)', fontSize: '1.12rem', fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text)' }}>
          Сценарии
        </h2>
        <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '56ch' }}>
          Расклады по близости интересов. Порядок — только для однозначного вывода: при равном качестве
          показываются все варианты, выбор за вами.
        </p>
      </div>
      <ul style={{ listStyle: 'none', padding: '0.7rem 0 0', margin: 0, display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
        {scenarios.map((s, i) => <ScenarioCard key={i} scenario={s} number={i + 1} />)}
      </ul>
    </div>
  );
}

Object.assign(window, { SatisfactionScenarios });
