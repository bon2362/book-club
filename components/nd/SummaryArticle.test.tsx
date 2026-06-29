import { render, screen } from '@testing-library/react'
import SummaryArticle from './SummaryArticle'

const helpfulProps = jest.fn()

jest.mock('./SummaryMarkdown', () => {
  return function MockSummaryMarkdown({ markdown }: { markdown: string }) {
    return <div>{markdown}</div>
  }
})

jest.mock('./SummaryHelpfulButton', () => {
  return function MockSummaryHelpfulButton(props: unknown) {
    helpfulProps(props)
    return <button>Helpful mock</button>
  }
})

describe('SummaryArticle', () => {
  beforeEach(() => helpfulProps.mockClear())

  it('renders author meta, reading time, title and tldr', () => {
    render(
      <SummaryArticle
        displayName="Reader One"
        title="Почему институты важны"
        tldr="Экономика держится на правилах игры."
        bodyMarkdown="## Главная мысль\n\nТекст."
        publishedAt={new Date('2025-03-14T00:00:00Z')}
        readingMinutes={8}
        summaryId="summary-1"
        initialHelpfulCount={4}
        hasSession
      />,
    )
    expect(screen.getByRole('heading', { name: 'Почему институты важны', level: 2 })).toBeInTheDocument()
    expect(screen.getByText('Reader One')).toBeInTheDocument()
    expect(screen.getByText('8 мин чтения · опубликовано 14 марта')).toBeInTheDocument()
    expect(screen.getByText('Экономика держится на правилах игры.')).toBeInTheDocument()
    expect(helpfulProps).toHaveBeenCalledWith({
      summaryId: 'summary-1',
      initialHelpfulCount: 4,
      hasSession: true,
    })
    expect(screen.getByTestId('summary-helpful-footer')).toContainElement(screen.getByRole('button', { name: 'Helpful mock' }))
  })
})
