import { TIMELINE_EPOCH_PALETTE } from './admin/palette'
import { normalizeEpochColor } from './data-color'

describe('normalizeEpochColor', () => {
  const tints = TIMELINE_EPOCH_PALETTE.map(option => option.value)

  it('keeps an approved epoch tint unchanged', () => {
    expect(normalizeEpochColor(tints[2])).toBe(tints[2])
  })

  it('projects a legacy saturated color onto the approved tint palette', () => {
    const normalized = normalizeEpochColor('#7C3AED')
    expect(tints).toContain(normalized)
    expect(normalized).not.toBe('#7C3AED')
  })

  it('maps the same legacy color to the same tint', () => {
    expect(normalizeEpochColor('#2563EB')).toBe(normalizeEpochColor('#2563EB'))
  })

  it('uses the first tint for malformed data', () => {
    expect(normalizeEpochColor('not-a-color')).toBe(tints[0])
  })
})
