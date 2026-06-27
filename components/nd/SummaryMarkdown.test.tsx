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
      {children.split('\n').map((line, index, lines) => {
        const H1 = components.h1 ?? 'h1'
        const H2 = components.h2 ?? 'h2'
        const H3 = components.h3 ?? 'h3'
        const H4 = components.h4 ?? 'h4'
        const P = components.p ?? 'p'
        const Ul = components.ul ?? 'ul'
        const Ol = components.ol ?? 'ol'
        const Li = components.li ?? 'li'
        const Blockquote = components.blockquote ?? 'blockquote'
        if (line.startsWith('# ')) return <H1 key={index}>{line.slice(2)}</H1>
        if (line.startsWith('## ')) return <H2 key={index}>{line.slice(3)}</H2>
        if (line.startsWith('### ')) return <H3 key={index}>{line.slice(4)}</H3>
        if (line.startsWith('#### ')) return <H4 key={index}>{line.slice(5)}</H4>
        if (line.startsWith('- ') && !lines[index - 1]?.startsWith('- ')) {
          const items = lines.slice(index).filter(item => item.startsWith('- '))
          return <Ul key={index}>{items.map(item => <Li key={item}>{item.slice(2)}</Li>)}</Ul>
        }
        if (line.startsWith('- ')) return null
        if (/^\d+\. /.test(line) && !/^\d+\. /.test(lines[index - 1] ?? '')) {
          const items = lines.slice(index).filter(item => /^\d+\. /.test(item))
          return <Ol key={index}>{items.map(item => <Li key={item}>{item.replace(/^\d+\. /, '')}</Li>)}</Ol>
        }
        if (/^\d+\. /.test(line)) return null
        if (line.startsWith('> ')) return <Blockquote key={index}><P>{line.slice(2)}</P></Blockquote>
        if (line.startsWith('**') && line.endsWith('**')) return <strong key={index}>{line.slice(2, -2)}</strong>
        return line ? <P key={index}>{line}</P> : null
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

  it('renders an editorial details spine and hanging quote without toggle signs', () => {
    render(
      <SummaryMarkdown
        markdown={[
          '<details open>',
          '<summary>Революция и демократия</summary>',
          '',
          '> Политика начинается там, где заканчивается утопия.',
          '</details>',
        ].join('\n')}
      />,
    )

    const summary = screen.getByText('Революция и демократия')
    const details = summary.closest('details')
    const quote = screen.getByText('Политика начинается там, где заканчивается утопия.').closest('blockquote')

    expect(details).toHaveClass('nd-summary-details')
    expect(summary).toHaveClass('nd-summary-details__title')
    expect(details?.querySelector('.nd-summary-details__summary')).toBeInTheDocument()
    expect(details?.querySelector('.nd-summary-details__rail')).toHaveAttribute('aria-hidden', 'true')
    expect(details?.querySelector('.nd-summary-details__body')).toBeInTheDocument()
    expect(details).not.toHaveTextContent(/[+−]/)
    expect(quote).toHaveClass('nd-summary-blockquote')
    expect(quote?.querySelector('.nd-summary-blockquote__mark')).toHaveTextContent('“')
    expect(quote?.querySelector('.nd-summary-blockquote__mark')).toHaveAttribute('aria-hidden', 'true')
  })

  it('styles unordered and ordered lists with visible markers', () => {
    render(<SummaryMarkdown markdown={'- Первый вопрос\n- Второй вопрос\n\n1. Первый шаг\n2. Второй шаг'} />)

    const [unordered, ordered] = screen.getAllByRole('list')

    expect(unordered.tagName).toBe('UL')
    expect(unordered).toHaveStyle({
      listStyleType: 'disc',
    })
    expect(ordered.tagName).toBe('OL')
    expect(ordered).toHaveStyle({
      listStyleType: 'decimal',
    })
    expect(screen.getByText('Первый вопрос')).toHaveStyle({
      margin: '0.2rem 0',
    })
  })

  it('keeps readable spacing between paragraphs', () => {
    render(<SummaryMarkdown markdown={'Первый абзац.\n\nВторой абзац.'} />)

    expect(screen.getByText('Первый абзац.')).toHaveStyle({
      margin: '0 0 1rem',
    })
    expect(screen.getByText('Второй абзац.')).toHaveStyle({
      margin: '0 0 1rem',
    })
  })
})
