import { render, screen } from '@testing-library/react'
import SummaryArticle from './SummaryArticle'

jest.mock('./SummaryMarkdown', () => {
  return function MockSummaryMarkdown({ markdown }: { markdown: string }) {
    return <div>{markdown}</div>
  }
})

describe('SummaryArticle', () => {
  it('renders author meta, reading time, title and tldr', () => {
    render(
      <SummaryArticle
        displayName="Reader One"
        title="Почему институты важны"
        tldr="Экономика держится на правилах игры."
        bodyMarkdown="## Главная мысль\n\nТекст."
        publishedAt={new Date('2025-03-14T00:00:00Z')}
        readingMinutes={8}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Почему институты важны', level: 2 })).toBeInTheDocument()
    expect(screen.getByText('Reader One')).toBeInTheDocument()
    expect(screen.getByText('8 мин чтения · опубликовано 14 марта')).toBeInTheDocument()
    expect(screen.getByText('Экономика держится на правилах игры.')).toBeInTheDocument()
  })
})
