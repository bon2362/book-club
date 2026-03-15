/**
 * @jest-environment node
 */
import { approvedEmail, rejectedEmail } from './submission-status'

describe('approvedEmail', () => {
  it('возвращает объект с subject и html', () => {
    const result = approvedEmail('Сапиенс')
    expect(result).toHaveProperty('subject')
    expect(result).toHaveProperty('html')
  })

  it('subject содержит "одобрена"', () => {
    const { subject } = approvedEmail('Сапиенс')
    expect(subject).toMatch(/одобрена/i)
  })

  it('html содержит название книги', () => {
    const { html } = approvedEmail('Сапиенс')
    expect(html).toContain('Сапиенс')
  })

  it('html содержит позитивный контент', () => {
    const { html } = approvedEmail('Тест')
    expect(html).toContain('одобрена')
  })
})

describe('rejectedEmail', () => {
  it('возвращает объект с subject и html', () => {
    const result = rejectedEmail('Сапиенс')
    expect(result).toHaveProperty('subject')
    expect(result).toHaveProperty('html')
  })

  it('subject нейтральный (без слова "отклонена")', () => {
    const { subject } = rejectedEmail('Сапиенс')
    expect(subject).toMatch(/статус|обновлён/i)
    expect(subject).not.toMatch(/отклонена/i)
  })

  it('html содержит название книги', () => {
    const { html } = rejectedEmail('Сапиенс')
    expect(html).toContain('Сапиенс')
  })

  it('html содержит нейтральный тон (не была одобрена)', () => {
    const { html } = rejectedEmail('Тест')
    expect(html).toContain('не была одобрена')
  })
})
