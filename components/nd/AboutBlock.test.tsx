/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import AboutBlock from './AboutBlock'

const header = {
  title: 'Что это',
  body: 'Мы собираемся небольшими группами по 3-4 человека.',
}

const sections = [
  { id: 's1', title: 'Как это устроено?', body: 'Отмечайте книги, которые хотите прочитать.\n\nГруппа в Телеграм.' },
  { id: 's2', title: 'Для кого это?', body: 'Для тех, кому совместное чтение помогает.' },
  { id: 's3', title: 'Почему именно демократия?', body: 'Нам интересна демократия.' },
  { id: 's4', title: 'Чем это не является?', body: 'Это не дискуссионный клуб.' },
]

function renderBlock(overrides: { onClose?: () => void } = {}) {
  return render(<AboutBlock onClose={overrides.onClose ?? (() => {})} header={header} sections={sections} />)
}

describe('nd/AboutBlock', () => {
  it('renders the block with L1 text and eyebrow', () => {
    renderBlock()
    expect(screen.getByRole('region', { name: 'Читательские круги' })).toBeInTheDocument()
    expect(screen.getByText('Что это')).toBeInTheDocument()
    expect(screen.getByText(/Мы собираемся небольшими группами/)).toBeInTheDocument()
  })

  it('accordion is closed initially', () => {
    renderBlock()
    expect(screen.queryByText('Как это устроено?')).not.toBeInTheDocument()
  })

  it('clicking the L1 block area opens the accordion', () => {
    renderBlock()
    const region = screen.getByRole('region', { name: 'Читательские круги' })
    fireEvent.click(region)
    expect(screen.getByText('Как это устроено?')).toBeInTheDocument()
  })

  it('clicking "Подробнее ↓" opens the accordion', () => {
    renderBlock()
    fireEvent.click(screen.getByText('Подробнее ↓'))
    expect(screen.getByText('Как это устроено?')).toBeInTheDocument()
  })

  it('clicking a section question opens it', () => {
    renderBlock()
    fireEvent.click(screen.getByText('Подробнее ↓'))
    const btn = screen.getByRole('button', { name: /Как это устроено\?/ })
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/Отмечайте книги/)).toBeInTheDocument()
  })

  it('clicking another section closes the first', () => {
    renderBlock()
    fireEvent.click(screen.getByText('Подробнее ↓'))
    const btn1 = screen.getByRole('button', { name: /Как это устроено\?/ })
    const btn2 = screen.getByRole('button', { name: /Для кого это\?/ })
    fireEvent.click(btn1)
    expect(btn1).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(btn2)
    expect(btn1).toHaveAttribute('aria-expanded', 'false')
    expect(btn2).toHaveAttribute('aria-expanded', 'true')
  })

  it('clicking an open section closes it', () => {
    renderBlock()
    fireEvent.click(screen.getByText('Подробнее ↓'))
    const btn = screen.getByRole('button', { name: /Как это устроено\?/ })
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'false')
  })

  it('clicking × calls onClose', () => {
    const onClose = jest.fn()
    renderBlock({ onClose })
    fireEvent.click(screen.getByTitle('Скрыть'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('× button does not open the accordion', () => {
    const onClose = jest.fn()
    renderBlock({ onClose })
    fireEvent.click(screen.getByTitle('Скрыть'))
    expect(screen.queryByText('Как это устроено?')).not.toBeInTheDocument()
    expect(onClose).toHaveBeenCalled()
  })

  it('renders all accordion sections when accordion is open', () => {
    renderBlock()
    fireEvent.click(screen.getByText('Подробнее ↓'))
    expect(screen.getByText('Как это устроено?')).toBeInTheDocument()
    expect(screen.getByText('Для кого это?')).toBeInTheDocument()
    expect(screen.getByText('Почему именно демократия?')).toBeInTheDocument()
    expect(screen.getByText('Чем это не является?')).toBeInTheDocument()
  })

  it('renders multi-paragraph body as separate <p> elements', () => {
    renderBlock()
    fireEvent.click(screen.getByText('Подробнее ↓'))
    fireEvent.click(screen.getByRole('button', { name: /Как это устроено\?/ }))
    expect(screen.getByText(/Отмечайте книги/)).toBeInTheDocument()
    expect(screen.getByText(/Группа в Телеграм/)).toBeInTheDocument()
  })

  it('open section resets when accordion is collapsed and reopened', () => {
    renderBlock()
    fireEvent.click(screen.getByText('Подробнее ↓'))
    const btn = screen.getByRole('button', { name: /Как это устроено\?/ })
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByText('Свернуть ↑'))
    fireEvent.click(screen.getByText('Подробнее ↓'))
    const btn2 = screen.getByRole('button', { name: /Как это устроено\?/ })
    expect(btn2).toHaveAttribute('aria-expanded', 'false')
  })

  it('Enter key on L1 block opens accordion when closed', () => {
    renderBlock()
    const region = screen.getByRole('region', { name: 'Читательские круги' })
    fireEvent.keyDown(region, { key: 'Enter' })
    expect(screen.getByText('Как это устроено?')).toBeInTheDocument()
  })
})
