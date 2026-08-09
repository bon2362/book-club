export default function CalendarLegend({ markedCount }: { markedCount: number }) {
  const scale = Array.from({ length: Math.max(1, markedCount) }, (_, index) => Math.round(10 + 28 * ((index + 1) / Math.max(1, markedCount))))
  return (
    <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--hair)', display: 'flex', flexDirection: 'column', gap: 7, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ display: 'flex', gap: 2 }}>{scale.map((percent) => <i key={percent} style={{ width: 14, height: 16, background: `color-mix(in srgb, var(--success) ${percent}%, transparent)` }} />)}</span>
        <span>1 → {Math.max(1, markedCount)} свободны</span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Swatch background="color-mix(in srgb, var(--success) 62%, transparent)" /><span>свободны все — можно назначить</span></div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Swatch mine background="color-mix(in srgb, var(--success) 28%, transparent)" /><span>отмечено вами</span></div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Swatch background="repeating-linear-gradient(135deg, color-mix(in srgb, var(--accent) 16%, transparent) 0 4px, color-mix(in srgb, var(--accent) 5%, transparent) 4px 8px)" /><span>занято другой встречей</span></div>
    </div>
  )
}

function Swatch({ background, mine = false }: { background: string; mine?: boolean }) {
  return (
    <span style={{ width: 16, height: 16, flex: 'none', border: '1px solid var(--hair-soft)', position: 'relative', background }}>
      {mine && <span style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, borderTop: '7px solid color-mix(in srgb, var(--success-hover) 85%, transparent)', borderRight: '7px solid transparent' }} />}
    </span>
  )
}
