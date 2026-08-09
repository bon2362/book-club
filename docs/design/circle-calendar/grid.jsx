function CalendarGrid({ cols, slots, participants, avail, busy, focus, canEdit, onPaint, onCellClick, cellInfo, cand, selected, mobile, mark, dayRuns }) {
  const [hover, setHover] = React.useState(null);
  const paint = React.useRef(null);
  const holdTimer = React.useRef(null);
  const [painting, setPainting] = React.useState(false);

  const applyPaint = (day, slot) => {
    const p = paint.current;
    if (!p) return;
    p.moved = true;
    onPaint(`${day}:${slot}`, p.mode);
  };
  const down = (e, day, slot, dead) => {
    if (!canEdit || dead) return;
    const key = `${day}:${slot}`;
    paint.current = { mode: avail.me.has(key) ? 'erase' : 'paint', moved: false };
    if (e.pointerType === 'mouse') setPainting(true);
    else holdTimer.current = setTimeout(() => { setPainting(true); applyPaint(day, slot); }, 320);
  };
  const enter = (day, slot) => { setHover(`${day}:${slot}`); if (painting) applyPaint(day, slot); };
  const up = (day, slot, dead) => {
    clearTimeout(holdTimer.current);
    const p = paint.current;
    setPainting(false); paint.current = null;
    if (dead) return;
    if (!p || !p.moved) onCellClick(day, slot);
  };
  React.useEffect(() => {
    const stop = () => { clearTimeout(holdTimer.current); setPainting(false); paint.current = null; };
    window.addEventListener('pointerup', stop);
    return () => window.removeEventListener('pointerup', stop);
  }, []);

  const template = `52px ${cols.map((c) => (c.gap ? '9px' : 'minmax(0,1fr)')).join(' ')}`;
  const rows = [];
  for (let s = slots[0]; s < slots[1]; s++) rows.push(s);
  const total = participants.length;

  return (
    <div className={`grid mark-${mark}${painting ? ' painting' : ''}`} style={{ gridTemplateColumns: template }}>
      <div />
      {cols.map((c, i) => c.gap
        ? <div key={`g${i}`} className="gap" />
        : <div key={c.day} className={`gh${dayShort(c.day).weekend ? ' we' : ''}`}>{dayShort(c.day).wd}<b>{dayShort(c.day).num} {dayShort(c.day).mon}</b>{mark === 'head' && dayRuns[c.day] > 0 && <span className="daymark">✓ {dayRuns[c.day]} {dayRuns[c.day] === 1 ? 'окно' : 'окна'}</span>}</div>)}
      {rows.map((s) => (
        <React.Fragment key={s}>
          <div className="tl" style={{ height: 'var(--cell-h)' }}>{s % 2 === 0 ? slotLabel(s) : ''}</div>
          {cols.map((c, i) => {
            if (c.gap) return <div key={`g${i}${s}`} className="gap-h" />;
            const info = cellInfo(c.day, s);
            const key = `${c.day}:${s}`;
            const isCand = !focus && cand.covered.has(key);
            const cls = ['cell'];
            if (s % 2 === 0) cls.push('h');
            if (i === cols.length - 1) cls.push('last');
            if (info.dead) cls.push('dead');
            if (info.meeting) { cls.push('meet'); if (info.meetingFirst) cls.push('meet-first'); }
            else if (info.myBusy) cls.push('busy');
            else {
              if (!focus && info.mine && !avail.me.has(`${c.day}:${s - 1}`)) cls.push('mine');
              if (isCand) {
                cls.push('cand');
                if (!cand.covered.has(`${c.day}:${s - 1}`)) cls.push('cand-first');
                if (!cand.covered.has(`${c.day}:${s + 1}`)) cls.push('cand-last');
              }
            }
            if (selected === key) cls.push('sel');
            const ratio = focus ? (info.focusFree ? 1 : 0) : info.free / Math.max(total, 1);
            const full = !focus && total > 0 && info.free === total;
            const alpha = focus ? 0.5 : full ? 0.62 : 0.1 + 0.28 * ratio;
            const bg = info.meeting || info.myBusy || ratio === 0 ? undefined : `rgba(45,106,79,${alpha.toFixed(3)})`;
            const hovered = hover === key && !painting && !info.dead;
            return (
              <div key={key} data-cell={key} className={cls.join(' ')} style={{ height: 'var(--cell-h)', background: bg }}
                onPointerDown={(e) => down(e, c.day, s, info.dead)}
                onPointerEnter={() => enter(c.day, s)}
                onPointerLeave={() => setHover((h) => (h === key ? null : h))}
                onPointerUp={() => up(c.day, s, info.dead)}>
                {info.meetingFirst && <span className="meetlabel">{slotLabel(s)}</span>}
                {mark === 'tick' && cls.includes('cand-first') && <span className="tick">✓</span>}
                {!mobile && hovered && !info.meeting && cand.starts.has(key) && canEdit && (
                  <button className="hint" onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); onCellClick(c.day, s, true); }}>
                    Назначить встречу на {slotLabel(s)}
                  </button>)}
                {!mobile && hovered && !info.meeting && !cand.starts.has(key) && info.free > 0 && (
                  <span className="hint quiet">{info.free} из {total}</span>)}
              </div>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
}

Object.assign(window, { CalendarGrid });
