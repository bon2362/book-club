const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "scenario": "Есть встреча",
  "viewer": "Участник",
  "crop": "По данным",
  "device": "Десктоп",
  "mark": "Только тон",
  "localTimes": true
}/*EDITMODE-END*/;

const NOW_SLOT = 24;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const mobile = t.device === 'Телефон';
  const anon = t.viewer === 'Аноним';
  const admin = t.viewer === 'Админ';
  const broken = t.scenario === 'Круг распался';
  const scenario = t.scenario;
  const actingRef = admin ? 'mark' : 'galia';
  const canEdit = !anon && !broken;

  const [tz, setTz] = React.useState('Europe/Belgrade');
  const [tzConfirmed, setTzConfirmed] = React.useState(false);
  const [duration, setDuration] = React.useState(60);
  const [page, setPage] = React.useState(0);
  const [cropMode, setCropMode] = React.useState(true);
  const [fullDay, setFullDay] = React.useState(false);
  const [focus, setFocus] = React.useState(null);
  const [selected, setSelected] = React.useState(null);
  const [open, setOpen] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const [confirmCancel, setConfirmCancel] = React.useState(null);
  const wrap = React.useRef(null);

  const baseAvail = React.useMemo(() => {
    const src = {};
    PARTICIPANTS.forEach((p) => {
      if (scenario === 'Пусто') src[p.ref] = new Set();
      else src[p.ref] = expand(AVAILABILITY[p.ref]);
    });
    if (scenario === 'Пусто') src.galia = new Set();
    return src;
  }, [scenario]);
  const [mine, setMine] = React.useState(null);
  React.useEffect(() => { setMine(null); setPage(0); setSelected(null); }, [scenario, cropMode, t.viewer]);
  const myAvail = mine || baseAvail[actingRef];
  const avail = React.useMemo(() => {
    const a = { ...baseAvail, [actingRef]: myAvail };
    a.me = myAvail;
    return a;
  }, [baseAvail, myAvail, actingRef]);
  const busy = React.useMemo(() => {
    const m = {};
    PARTICIPANTS.forEach((p) => { m[p.ref] = busyMap(BUSY_ELSEWHERE[p.ref]); });
    return m;
  }, []);

  const [meetings, setMeetings] = React.useState(null);
  const scenarioMeetings = React.useMemo(() => {
    if (scenario === 'Пусто' || scenario === 'Закрашено') return [];
    if (scenario === 'Только прошедшие') return MEETINGS.filter((m) => m.past);
    return MEETINGS;
  }, [scenario]);
  React.useEffect(() => { setMeetings(null); }, [scenario]);
  const allMeetings = meetings || scenarioMeetings;
  const upcoming = allMeetings.filter((m) => !m.past && !m.canceled).sort((x, y) => x.day - y.day || x.slot - y.slot);
  const past = allMeetings.filter((m) => m.past);
  const meetSlots = React.useMemo(() => {
    const map = new Map();
    upcoming.forEach((m) => { const n = m.duration / 30; for (let i = 0; i < n; i++) map.set(`${m.day}:${m.slot + i}`, { m, first: i === 0 }); });
    return map;
  }, [allMeetings]);

  const [collapsed, setCollapsed] = React.useState(true);
  React.useEffect(() => { setCollapsed(upcoming.length > 0); }, [scenario]);
  const gridShown = upcoming.length === 0 || !collapsed;

  const dayHasData = (d) => PARTICIPANTS.some((p) => [...baseAvail[p.ref]].some((k) => k.startsWith(`${d}:`))) || upcoming.some((m) => m.day === d);
  const activeDays = React.useMemo(() => {
    const out = [];
    for (let d = 0; d < WINDOW_DAYS; d++) if (dayHasData(d)) out.push(d);
    return out;
  }, [baseAvail, allMeetings]);

  const cropped = cropMode && activeDays.length > 0;
  const perPage = mobile ? (cropped ? 4 : 7) : 7;
  const pageDays = React.useMemo(() => {
    if (cropped) return activeDays.slice(page * perPage, page * perPage + perPage);
    const out = [];
    for (let i = 0; i < perPage; i++) { const d = page * perPage + i; if (d < WINDOW_DAYS) out.push(d); }
    return out;
  }, [cropped, activeDays, page, perPage]);
  const pages = cropped ? Math.ceil(activeDays.length / perPage) : Math.ceil(WINDOW_DAYS / perPage);

  const cols = React.useMemo(() => {
    const out = [];
    pageDays.forEach((d, i) => { if (i > 0 && d - pageDays[i - 1] > 1) out.push({ gap: true }); out.push({ day: d }); });
    return out;
  }, [pageDays]);

  const slots = React.useMemo(() => {
    if (fullDay || !cropped) return fullDay ? [0, 48] : [20, 42];
    let min = 48, max = 0;
    pageDays.forEach((d) => {
      PARTICIPANTS.forEach((p) => baseAvail[p.ref].forEach((k) => { const [dd, ss] = k.split(':').map(Number); if (dd === d) { min = Math.min(min, ss); max = Math.max(max, ss + 1); } }));
      upcoming.forEach((m) => { if (m.day === d) { min = Math.min(min, m.slot); max = Math.max(max, m.slot + m.duration / 30); } });
    });
    if (min > max) return [20, 42];
    return [clamp(min - 2, 0, 46), clamp(max + 2, 2, 48)];
  }, [pageDays, baseAvail, fullDay, cropped, allMeetings]);

  const cellInfo = (day, slot) => {
    const key = `${day}:${slot}`;
    const dead = day < 0 || (day === 0 && slot < NOW_SLOT);
    const meeting = meetSlots.get(key);
    const freeRefs = [], busyRefs = [], idleRefs = [];
    PARTICIPANTS.forEach((p) => {
      const b = busy[p.ref].get(key);
      if (b) busyRefs.push({ p, book: b });
      else if (avail[p.ref].has(key)) freeRefs.push(p);
      else idleRefs.push(p);
    });
    const fits = slot + duration / 30 <= 48 && day < WINDOW_DAYS;
    return {
      dead, meeting: !!meeting, meetingFirst: meeting && meeting.first, meetingObj: meeting && meeting.m,
      free: freeRefs.length, freeRefs, busyRefs, idleRefs,
      mine: avail.me.has(key), myBusy: !!busy[actingRef].get(key),
      focusFree: focus ? avail[focus].has(key) && !busy[focus].get(key) : false,
      canStart: !dead && fits && !broken,
    };
  };

  const span = duration / 30;
  const cand = React.useMemo(() => {
    const covered = new Set(), starts = new Set();
    for (let d = 0; d < WINDOW_DAYS; d++) {
      for (let s = 0; s + span <= 48; s++) {
        let ok = true;
        for (let i = 0; i < span; i++) {
          const ci = cellInfo(d, s + i);
          if (ci.dead || ci.meeting || ci.free !== PARTICIPANTS.length) { ok = false; break; }
        }
        if (ok) { starts.add(`${d}:${s}`); for (let i = 0; i < span; i++) covered.add(`${d}:${s + i}`); }
      }
    }
    return { covered, starts };
  }, [avail, busy, duration, allMeetings, actingRef]);

  const dayRuns = React.useMemo(() => {
    const runs = {};
    for (let d = 0; d < WINDOW_DAYS; d++) {
      let n = 0;
      for (let s = 0; s < 48; s++) if (cand.covered.has(`${d}:${s}`) && !cand.covered.has(`${d}:${s - 1}`)) n++;
      if (n) runs[d] = n;
    }
    return runs;
  }, [cand]);
  const markKey = { 'Только тон': 'tone', 'Тон + галочка': 'tick', 'Метка в шапке дня': 'head', 'Рамка': 'ring' }[t.mark] || 'tone';

  const onCellClick = (day, slot, force) => {
    const key = `${day}:${slot}`;
    const ci = cellInfo(day, slot);
    if (ci.dead) return;
    if (force || !canEdit || ci.meeting || ci.myBusy) { setSelected(key); return; }
    if (!ci.mine) { paintRange(day, slot, 'paint'); return; }
    if (cand.covered.has(key)) { setSelected(key); return; }
    paintRange(day, slot, 'erase');
  };

  const paintRange = (day, slot, mode) => {
    setMine((prev) => {
      const next = new Set(prev || baseAvail[actingRef]);
      for (let i = 0; i < span && slot + i < 48; i++) {
        const k = `${day}:${slot + i}`;
        if (mode === 'paint') next.add(k); else next.delete(k);
      }
      return next;
    });
    setSelected(null);
  };

  const paintCell = (key, mode) => {
    setMine((prev) => {
      const next = new Set(prev || baseAvail[actingRef]);
      if (mode === 'paint') next.add(key); else next.delete(key);
      return next;
    });
    setSelected(null);
  };

  React.useEffect(() => {
    if (!selected) { setOpen(false); return; }
    setOpen(true);
  }, [selected]);

  const popPos = React.useMemo(() => {
    if (!selected || !wrap.current || mobile) return null;
    const el = wrap.current.querySelector(`[data-cell="${selected}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect(), w = wrap.current.getBoundingClientRect();
    let left = r.right - w.left + 10;
    if (left + 264 > w.width) left = r.left - w.left - 274;
    return { left: Math.max(6, left), top: clamp(r.top - w.top - 10, 6, w.height - 40) };
  }, [selected, mobile, page, slots]);

  const schedule = () => {
    const [d, s] = selected.split(':').map(Number);
    setMeetings([...allMeetings, { id: `n${Date.now()}`, day: d, slot: s, duration, createdBy: 'Вы' }]);
    setSelected(null); setCollapsed(true);
    setToast('Встреча назначена. Время занято во всех кругах участников.');
    setTimeout(() => setToast(null), 3200);
  };
  const cancelMeeting = (id) => {
    setMeetings(allMeetings.map((m) => (m.id === id ? { ...m, canceled: true } : m)));
    setConfirmCancel(null); setCollapsed(false);
    setToast('Встреча отменена. Время снова свободно.');
    setTimeout(() => setToast(null), 3200);
  };

  const info = selected ? cellInfo(...selected.split(':').map(Number)) : null;
  const tzOffset = TZ_UTC[tz];

  return (
    <div className={`page${mobile ? ' is-mobile' : ''}`}>
      {!anon && !tzConfirmed && (
        <div className="tzbar">
          <span>Время показано по <b className="mono">{tz}</b> — определили по браузеру.</span>
          <select value={tz} onChange={(e) => setTz(e.target.value)}>{TIMEZONES.map((z) => <option key={z}>{z}</option>)}</select>
          <button className="btn ghost" style={{ padding: '5px 10px' }} onClick={() => setTzConfirmed(true)}>Верно</button>
        </div>)}
      {(anon || tzConfirmed) && (
        <div className="tzbar"><span className="ok">✓</span><span>Время показано по <b className="mono">{tz}</b></span>
          <select value={tz} onChange={(e) => setTz(e.target.value)}>{TIMEZONES.map((z) => <option key={z}>{z}</option>)}</select></div>)}

      <div className="head">
        <div>
          <h1>{BOOK.title}</h1>
          <div className="author">{BOOK.author}</div>
          <div className="meta">
            <span className="dur">Длительность
              <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} disabled={!canEdit}>
                {[30, 60, 90, 120].map((d) => <option key={d} value={d}>{d} мин</option>)}
              </select>
            </span>
          </div>
        </div>
      </div>

      {broken && <div className="banner"><b>Круг №1 больше не существует.</b> Состав книги пересобран: сейчас у «Зари всего» другие круги. Назначенные встречи сохранены, но закрашивать время и назначать новые здесь нельзя. Ссылка на актуальный круг — на странице книги.</div>}
      {anon && <div className="banner">Вы смотрите страницу по ссылке. Видно наложение и встречи; закрашивать своё время могут только участники круга.</div>}
      {admin && <div className="banner">Админский режим: действия выполняются <b>за Марка</b> (<span className="mono">?as=mark</span>). В журнале останется административный actor.</div>}

      {upcoming.map((m, mi) => {
        const ci = cellInfo(m.day, m.slot);
        return (
          <div className="card next" key={m.id}>
            <div>
              <div className="micro">{mi === 0 ? 'Ближайшая встреча' : 'Затем'}</div>
              <div className="when">{dayLong(m.day)}, {slotLabel(m.slot)}–{shiftLabel(m.slot, m.duration / 60)}</div>
              <div className="sub">{m.duration} минут · назначил{m.createdBy === 'Вы' ? 'и вы' : `а ${m.createdBy}`}</div>
              {ci.free < PARTICIPANTS.length && <div className="warn">Это время не отмечено у: {ci.idleRefs.concat(ci.busyRefs.map((b) => b.p)).map((p) => p.name).join(', ')}</div>}
            </div>
            <div className="acts">
              {canEdit && <button className="btn danger" onClick={() => setConfirmCancel(m)}>Отменить</button>}
            </div>
          </div>);
      })}

      <div className="sect">
        {upcoming.length > 0 && <div className="sect-head">
          <button className="disclose" onClick={() => setCollapsed(!collapsed)}>{collapsed ? '▸ Назначить ещё встречу' : '▾ Свернуть календарь'}</button>
        </div>}

        {gridShown && (
          <div className="layout">
            <div>
              <div className="weeknav">
                <button className="navbtn" disabled={page === 0} onClick={() => setPage(page - 1)}>‹</button>
                <div className="range">{pageDays.length ? `${dayShort(pageDays[0]).num} ${dayShort(pageDays[0]).mon} — ${dayShort(pageDays[pageDays.length - 1]).num} ${dayShort(pageDays[pageDays.length - 1]).mon}` : '—'}
                  {cropped && <span className="micro" style={{ marginLeft: 10 }}>дни без отметок скрыты</span>}</div>
                <button className="navbtn" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>›</button>
              </div>
              <div className="gridwrap" ref={wrap}>
                {scenario === 'Пусто' && <div className="empty" style={{ marginBottom: 12 }}><b>Пока никто не отметил своё время</b>{canEdit ? 'Протяните мышью по клеткам — или нажмите на клетку и отметьтесь в окне. Сохраняется само.' : 'Участники круга ещё не заполняли календарь.'}</div>}
                <CalendarGrid cols={cols} slots={slots} participants={PARTICIPANTS} avail={avail} busy={busy}
                  focus={focus} canEdit={canEdit} onPaint={paintCell} cellInfo={cellInfo} onCellClick={onCellClick}
                  cand={cand} selected={selected} mobile={mobile} mark={markKey} dayRuns={dayRuns} />
                <div className="gridfoot">
                  <div className="seg">
                    <button className={cropMode ? 'on' : ''} onClick={() => { setCropMode(true); setPage(0); }}>Дни с отметками</button>
                    <button className={!cropMode ? 'on' : ''} onClick={() => { setCropMode(false); setPage(0); }}>Все дни подряд</button>
                  </div>
                  <button className="linkbtn" onClick={() => setFullDay(!fullDay)}>{fullDay ? 'Свернуть до вечера' : 'Показать сутки'}</button>
                </div>
                {open && info && !mobile && popPos && (
                  <CellPopover info={info} selected={selected} duration={duration} canEdit={canEdit} localTimes={t.localTimes}
                    tzOffset={tzOffset} style={popPos} onClose={() => setSelected(null)} onSchedule={schedule} canSchedule={cand.starts.has(selected)}
                    onToggleMine={() => paintCell(selected, info.mine ? 'erase' : 'paint')} actingRef={actingRef} />)}
              </div>
              {mobile && <div className="micro" style={{ marginTop: 8 }}>тап — открыть слот · долгое нажатие и протягивание — закрасить</div>}
            </div>

            <div className="side">
              <h3>Круг</h3>
              <div className="hintline">Наведите на имя, чтобы увидеть только его время</div>
              <ul className="plist">
                {PARTICIPANTS.map((p) => {
                  const empty = avail[p.ref].size === 0;
                  return (
                    <li key={p.ref} className={`${focus === p.ref ? 'on' : ''}${empty ? ' none' : ''}`}
                      onMouseEnter={() => !mobile && setFocus(p.ref)} onMouseLeave={() => !mobile && setFocus(null)}
                      onClick={() => setFocus(focus === p.ref ? null : p.ref)}>
                      <span className="av">{p.name[0]}</span>
                      <span>
                        <span className="nm">{p.ref === actingRef ? `${p.name} · вы` : p.name}</span><br />
                        {empty ? <span className="warnline">ещё не отмечался</span> : <span className="tz">UTC{p.utc >= 0 ? '+' : '−'}{Math.abs(p.utc)}</span>}
                      </span>
                    </li>);
                })}
              </ul>
              <div className="legend">
                <div className="row"><span className="scale">{[0.14, 0.2, 0.26, 0.32].map((a, i) => <i key={i} style={{ background: `rgba(45,106,79,${a})` }} />)}</span><span>1 → 4 свободны</span></div>
                <div className={`row`}><span className={`sw ${markKey === 'ring' ? 'cand' : 'tone'}`} style={{ background: 'rgba(45,106,79,0.62)' }} /><span>свободны все — можно назначить</span></div>
                <div className="row"><span className="sw mine" style={{ background: 'rgba(45,106,79,0.28)' }} /><span>отмечено вами</span></div>
                <div className="row"><span className="sw busy" /><span>занято другой встречей</span></div>
                <div className="row"><span className="sw meet" /><span>встреча этого круга</span></div>
              </div>
            </div>
          </div>)}
      </div>

      {past.length > 0 && (
        <details className="past">
          <summary>Уже прошли ({past.length})</summary>
          <ul>{past.map((m) => <li key={m.id}><span style={{ color: 'var(--text-body)' }}>{dayLong(m.day)}, {slotLabel(m.slot)}–{shiftLabel(m.slot, m.duration / 60)}</span><span>{m.duration} мин · {m.createdBy}</span></li>)}</ul>
        </details>)}

      {open && info && mobile && (
        <div className="modal-bg" onClick={() => setSelected(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 340 }}>
            <CellPopover info={info} selected={selected} duration={duration} canEdit={canEdit} localTimes={t.localTimes}
              tzOffset={tzOffset} style={{ position: 'static', width: '100%' }} onClose={() => setSelected(null)} canSchedule={cand.starts.has(selected)}
              onSchedule={schedule} onToggleMine={() => paintCell(selected, info.mine ? 'erase' : 'paint')} actingRef={actingRef} />
          </div>
        </div>)}

      {confirmCancel && (
        <div className="modal-bg" onClick={() => setConfirmCancel(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Отменить встречу?</h3>
            <p>{dayLong(confirmCancel.day)}, {slotLabel(confirmCancel.slot)}–{shiftLabel(confirmCancel.slot, confirmCancel.duration / 60)}. Время сразу освободится у всех пятерых — в том числе в других их кругах. Отмена видна всем участникам.</p>
            <div className="acts">
              <button className="btn ghost" onClick={() => setConfirmCancel(null)}>Оставить</button>
              <button className="btn danger" onClick={() => cancelMeeting(confirmCancel.id)}>Отменить встречу</button>
            </div>
          </div>
        </div>)}

      {toast && <div className="toast">{toast}</div>}

      <TweaksPanel>
        <TweakSection label="Состояние" />
        <TweakSelect label="Сценарий" value={t.scenario} options={['Пусто', 'Закрашено', 'Есть встреча', 'Только прошедшие', 'Круг распался']} onChange={(v) => setTweak('scenario', v)} />
        <TweakSelect label="Смотрит" value={t.viewer} options={['Участник', 'Аноним', 'Админ']} onChange={(v) => setTweak('viewer', v)} />
        <TweakSection label="Сетка" />
        <TweakSelect label="Полное пересечение" value={t.mark} options={['Только тон', 'Тон + галочка', 'Метка в шапке дня', 'Рамка']} onChange={(v) => setTweak('mark', v)} />
        <TweakRadio label="Экран" value={t.device} options={['Десктоп', 'Телефон']} onChange={(v) => setTweak('device', v)} />
        <TweakToggle label="Локальное время участников" value={t.localTimes} onChange={(v) => setTweak('localTimes', v)} />
      </TweaksPanel>
    </div>
  );
}

function CellPopover({ info, selected, duration, canEdit, localTimes, tzOffset, style, onClose, onSchedule, onToggleMine, actingRef, canSchedule }) {
  const [d, s] = selected.split(':').map(Number);
  const all = info.free === PARTICIPANTS.length;
  const rows = PARTICIPANTS.map((p) => {
    const b = info.busyRefs.find((x) => x.p.ref === p.ref);
    const free = info.freeRefs.includes(p);
    return { p, free, book: b && b.book };
  });
  return (
    <div className="pop card" style={style}>
      <h4>{dayLong(d)}</h4>
      <div className="cnt">{slotLabel(s)}–{shiftLabel(s, duration / 60)} · <b className={all ? '' : 'part'}>свободны {info.free} из {PARTICIPANTS.length}</b></div>
      <ul>
        {rows.map(({ p, free, book }) => (
          <li key={p.ref} className={free ? 'free' : book ? 'busy' : ''}>
            <span className="nm">{p.ref === actingRef ? `${p.name} · вы` : p.name}</span>
            <span className="st">{book ? `занято · ${book}` : free ? (localTimes ? `свободно · ${shiftLabel(s, p.utc - tzOffset)} у себя` : 'свободно') : 'нет отметки'}</span>
          </li>))}
      </ul>
      {info.meeting
        ? <div className="note">Здесь уже стоит встреча этого круга.</div>
        : <div className="acts">
          {canEdit && canSchedule && <button className="btn go" onClick={onSchedule}>Назначить встречу на {slotLabel(s)}</button>}
          {canEdit && <button className="btn ghost" onClick={onToggleMine}>{info.mine ? 'Убрать своё время' : 'Отметить: я свободен'}</button>}
          {canEdit && !canSchedule && <div className="note">Встреча на {duration} мин отсюда не помещается: нужно, чтобы всё это время было свободно у всех пятерых.</div>}
          {!canEdit && <div className="note">Только участники круга могут отмечать время и назначать встречи.</div>}
        </div>}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
