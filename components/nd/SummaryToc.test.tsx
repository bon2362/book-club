import { render, screen, fireEvent } from '@testing-library/react'
import SummaryToc from './SummaryToc'

beforeAll(() => {
  // jsdom не реализует IntersectionObserver
  class IO {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  }
  Object.assign(global, { IntersectionObserver: IO })
})

const headings = [
  { id: 'контекст', text: 'Контекст' },
  { id: 'идеи', text: 'Ключевые идеи' },
  { id: 'выводы', text: 'Выводы' },
]

describe('SummaryToc', () => {
  it('рендерит все H2 как якорные ссылки в рукаве', () => {
    render(<SummaryToc headings={headings} />)
    const rail = screen.getByRole('navigation', { name: 'Разделы статьи' })
    expect(rail).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Контекст|Ключевые идеи|Выводы/ })).toHaveLength(3)
    expect(screen.getByRole('link', { name: 'Контекст' })).toHaveAttribute('href', '#контекст')
  })

  it('клик по пункту скроллит к нужному элементу', () => {
    const scrollIntoView = jest.fn()
    document.getElementById = jest.fn(() => ({ scrollIntoView }) as unknown as HTMLElement)
    render(<SummaryToc headings={headings} />)
    fireEvent.click(screen.getByRole('link', { name: 'Выводы' }))
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' })
  })

  it('мобильный бар показывает первую секцию и открывает лист', () => {
    render(<SummaryToc headings={headings} />)
    const toggle = screen.getByRole('button', { name: /Контекст/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    // в открытом листе тоже есть ссылки на секции
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
