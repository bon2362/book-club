// Мок-данные календаря круга. Время — получасовые слоты, индекс = получасы от 00:00.
const TODAY = new Date(2026, 7, 9, 12, 0, 0); // вс, 9 августа 2026
const WINDOW_DAYS = 28;

const PARTICIPANTS = [
  { ref: 'galia', name: 'Галия', tz: 'Europe/Belgrade', utc: 2, me: true },
  { ref: 'julia', name: 'Юля', tz: 'Europe/Amsterdam', utc: 2 },
  { ref: 'polina', name: 'Полина', tz: 'Asia/Tbilisi', utc: 4 },
  { ref: 'mark', name: 'Марк', tz: 'Europe/Moscow', utc: 3 },
  { ref: 'anya', name: 'Аня', tz: 'America/New_York', utc: -4 },
];

// [dayOffset, startSlot, endSlot) в поясе смотрящего
const AVAILABILITY = {
  galia: [[4, 32, 40], [5, 30, 38], [6, 34, 44], [11, 32, 42], [12, 36, 44], [13, 30, 40], [19, 32, 42]],
  julia: [[4, 34, 42], [5, 34, 40], [6, 34, 42], [11, 34, 40], [12, 34, 42], [18, 32, 40], [19, 34, 44]],
  polina: [[4, 30, 38], [6, 32, 42], [11, 36, 44], [12, 34, 40], [13, 34, 42], [19, 30, 40]],
  mark: [[5, 36, 44], [6, 34, 40], [11, 32, 40], [12, 38, 46], [13, 36, 44], [20, 34, 42]],
  anya: [[6, 36, 42], [11, 34, 42], [12, 36, 42], [19, 36, 44]],
};

// Занято встречами в других кругах: [dayOffset, startSlot, endSlot, книга]
const BUSY_ELSEWHERE = {
  mark: [[6, 38, 40, 'Дом листьев']],
  galia: [[12, 36, 38, 'Игра в бисер']],
  julia: [[11, 38, 40, 'Дом листьев']],
};

const MEETINGS = [
  { id: 'm1', day: 6, slot: 34, duration: 60, createdBy: 'Юля' },
  { id: 'm0', day: -7, slot: 36, duration: 60, createdBy: 'Галия', past: true },
  { id: 'm-1', day: -14, slot: 36, duration: 90, createdBy: 'Галия', past: true },
];

const BOOK = { title: 'Заря всего', author: 'Дэвид Гребер, Дэвид Уэнгроу', circle: 1, circles: 2 };

const TIMEZONES = ['Europe/Belgrade', 'Europe/Moscow', 'Asia/Tbilisi', 'Europe/Amsterdam', 'America/New_York'];
const TZ_UTC = { 'Europe/Belgrade': 2, 'Europe/Moscow': 3, 'Asia/Tbilisi': 4, 'Europe/Amsterdam': 2, 'America/New_York': -4 };

function dateOf(dayOffset) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(0, 0, 0, 0);
  return d;
}
function slotLabel(slot) {
  const h = Math.floor(slot / 2), m = slot % 2 ? '30' : '00';
  return `${String(h % 24).padStart(2, '0')}:${m}`;
}
function shiftLabel(slot, delta) {
  return slotLabel(((slot + delta * 2) % 48 + 48) % 48);
}
function dayShort(dayOffset) {
  const d = dateOf(dayOffset);
  return { wd: d.toLocaleDateString('ru-RU', { weekday: 'short' }), num: d.getDate(), mon: d.toLocaleDateString('ru-RU', { month: 'short' }).replace('.', ''), weekend: [0, 6].includes(d.getDay()) };
}
function dayLong(dayOffset) {
  return dateOf(dayOffset).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
}
function expand(blocks) {
  const set = new Set();
  (blocks || []).forEach(([d, a, b]) => { for (let s = a; s < b; s++) set.add(`${d}:${s}`); });
  return set;
}
function busyMap(blocks) {
  const map = new Map();
  (blocks || []).forEach(([d, a, b, book]) => { for (let s = a; s < b; s++) map.set(`${d}:${s}`, book); });
  return map;
}

Object.assign(window, { TODAY, WINDOW_DAYS, PARTICIPANTS, AVAILABILITY, BUSY_ELSEWHERE, MEETINGS, BOOK, TIMEZONES, TZ_UTC, dateOf, slotLabel, shiftLabel, dayShort, dayLong, expand, busyMap });
