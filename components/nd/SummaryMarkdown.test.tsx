import { render, screen } from '@testing-library/react'
import SummaryMarkdown from './SummaryMarkdown'

jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => (
    <div>
      {children.split('\n').map((line, index) => {
        if (line.startsWith('# ')) return <h1 key={index}>{line.slice(2)}</h1>
        if (line.startsWith('**') && line.endsWith('**')) return <strong key={index}>{line.slice(2, -2)}</strong>
        return line ? <p key={index}>{line}</p> : null
      })}
    </div>
  ),
}))

describe('SummaryMarkdown', () => {
  it('renders markdown formatting without executing raw html', () => {
    render(<SummaryMarkdown markdown={'# Заголовок\n\n**важно**\n\n<script>alert(1)</script>'} />)

    expect(screen.getByRole('heading', { name: 'Заголовок' })).toBeInTheDocument()
    expect(screen.getByText('важно')).toBeInTheDocument()
    expect(document.querySelector('script')).toBeNull()
  })
})
