import { fireEvent, render, screen } from '@testing-library/react'
import MatchingInstructions from './MatchingInstructions'

jest.mock('./SummaryMarkdown', () => {
  return function MockSummaryMarkdown({ markdown }: { markdown: string }) {
    return <div data-testid="matching-instructions-markdown">{markdown}</div>
  }
})

describe('MatchingInstructions', () => {
  it('renders administrator supplied labels and the complete Markdown body when expanded', () => {
    render(
      <MatchingInstructions
        instructions={{
          title: 'Как работает подбор',
          lead: 'Отметьте подходящие книги',
          expandLabel: 'Показать правила',
          collapseLabel: 'Скрыть правила',
          bodyMarkdown: '- Можно читать несколько книг\n- У групп может быть общая книга',
        }}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Как работает подбор' })).toBeInTheDocument()
    expect(screen.getByText('Отметьте подходящие книги')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Показать правила' })).toBeInTheDocument()
    expect(screen.queryByTestId('matching-instructions-markdown')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Показать правила' }))

    expect(screen.getByRole('button', { name: 'Скрыть правила' })).toBeInTheDocument()
    expect(screen.getByTestId('matching-instructions-markdown')).toHaveTextContent('Можно читать несколько книг')
  })
})
