export function bodyToParagraphs(body: string): string[] {
  return body
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p.length > 0)
}
