import { render, screen } from '@testing-library/react'
import SummaryMarkdown from './SummaryMarkdown'

jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({
    children,
    components = {},
  }: {
    children: string
    components?: Record<string, React.ComponentType<{ children: React.ReactNode; href?: string }>>
  }) => (
    <div>
      {children.split('\n').map((line, index) => {
        const H1 = components.h1 ?? 'h1'
        const H2 = components.h2 ?? 'h2'
        const H3 = components.h3 ?? 'h3'
        const H4 = components.h4 ?? 'h4'
        if (line.startsWith('# ')) return <H1 key={index}>{line.slice(2)}</H1>
        if (line.startsWith('## ')) return <H2 key={index}>{line.slice(3)}</H2>
        if (line.startsWith('### ')) return <H3 key={index}>{line.slice(4)}</H3>
        if (line.startsWith('#### ')) return <H4 key={index}>{line.slice(5)}</H4>
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

  it('styles third and fourth level headings for long summaries', () => {
    render(<SummaryMarkdown markdown={'### Подраздел\n\n#### Внутренний тезис'} />)

    expect(screen.getByRole('heading', { name: 'Подраздел', level: 3 })).toHaveStyle({
      fontSize: '1.12rem',
    })
    expect(screen.getByRole('heading', { name: 'Внутренний тезис', level: 4 })).toHaveStyle({
      textTransform: 'uppercase',
    })
  })

  it('renders portable closed and open details blocks with markdown bodies', () => {
    render(
      <SummaryMarkdown
        markdown={[
          '<details>',
          '<summary>Аргументы автора</summary>',
          '',
          '**Первый тезис**',
          '</details>',
          '',
          '<details open>',
          '<summary>Контекст</summary>',
          '',
          'Открыт сразу',
          '</details>',
        ].join('\n')}
      />,
    )

    const closed = screen.getByText('Аргументы автора').closest('details')
    const open = screen.getByText('Контекст').closest('details')

    expect(closed).not.toHaveAttribute('open')
    expect(open).toHaveAttribute('open')
    expect(screen.getByText('Первый тезис')).toBeInTheDocument()
    expect(screen.getByText('Открыт сразу')).toBeInTheDocument()
  })
})
