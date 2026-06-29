export interface MatchingNameRow {
  userId: string
  name: string | null
  joinedAt: Date
  publicRef: string
}

function baseName(name: string | null): string {
  return name?.trim() || 'Без имени'
}

function compareStableIdentity(a: MatchingNameRow, b: MatchingNameRow): number {
  const joined = a.joinedAt.getTime() - b.joinedAt.getTime()
  if (joined !== 0) return joined
  return a.publicRef.localeCompare(b.publicRef)
}

export function assignMatchingDisplayNames(rows: MatchingNameRow[]): Map<string, string> {
  const groups = new Map<string, MatchingNameRow[]>()

  for (const row of rows) {
    const name = baseName(row.name)
    const group = groups.get(name) ?? []
    group.push(row)
    groups.set(name, group)
  }

  const result = new Map<string, string>()
  for (const [name, group] of Array.from(groups.entries())) {
    const ordered = [...group].sort(compareStableIdentity)
    ordered.forEach((row, index) => {
      result.set(row.userId, ordered.length === 1 ? name : `${name} (${index + 1})`)
    })
  }

  return result
}
