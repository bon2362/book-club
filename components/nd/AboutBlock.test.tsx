/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import AboutBlock from './AboutBlock'
import { track } from '@/lib/analytics'

jest.mock('@/lib/analytics', () => ({
  track: jest.fn(),
}))

const mockedTrack = track as jest.Mock

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
  beforeEach(() => {
    jest.clearAllMocks()
  })

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

  // Раскрытие самого блока шлёт своё событие, поэтому здесь считаем только
  // события о разделах: тест проверяет, что раздел даёт ровно одно событие.
  const sectionEvents = () => mockedTrack.mock.calls.filter(([event]) => event === 'about_section_opened')

  it('opening a section sends about_section_opened with its title and index', () => {
    renderBlock()
    fireEvent.click(screen.getByText('Подробнее ↓'))
    const btn = screen.getByRole('button', { name: /Для кого это\?/ })
    fireEvent.click(btn)
    expect(sectionEvents()).toHaveLength(1)
    expect(mockedTrack).toHaveBeenCalledWith('about_section_opened', { section_title: 'Для кого это?', section_index: 1 })
  })

  it('closing a section (clicking it again) does not send another event', () => {
    renderBlock()
    fireEvent.click(screen.getByText('Подробнее ↓'))
    const btn = screen.getByRole('button', { name: /Как это устроено\?/ })
    fireEvent.click(btn)
    expect(sectionEvents()).toHaveLength(1)
    fireEvent.click(btn)
    expect(sectionEvents()).toHaveLength(1)
  })

  it('switching to another section sends only one event, for the newly opened section', () => {
    renderBlock()
    fireEvent.click(screen.getByText('Подробнее ↓'))
    const btn1 = screen.getByRole('button', { name: /Как это устроено\?/ })
    const btn2 = screen.getByRole('button', { name: /Чем это не является\?/ })
    fireEvent.click(btn1)
    expect(sectionEvents()).toHaveLength(1)
    fireEvent.click(btn2)
    expect(sectionEvents()).toHaveLength(2)
    expect(mockedTrack).toHaveBeenLastCalledWith('about_section_opened', { section_title: 'Чем это не является?', section_index: 3 })
  })

  it('«Подробнее» sends about_block_expanded, «Свернуть» — about_block_collapsed', () => {
    renderBlock()
    fireEvent.click(screen.getByText('Подробнее ↓'))
    expect(mockedTrack).toHaveBeenCalledWith('about_block_expanded', { source: 'more_button' })
    fireEvent.click(screen.getByText('Свернуть ↑'))
    expect(mockedTrack).toHaveBeenCalledWith('about_block_collapsed', { source: 'more_button' })
  })

  it('clicking the block itself sends about_block_expanded with source block', () => {
    renderBlock()
    fireEvent.click(screen.getByRole('region', { name: 'Читательские круги' }))
    expect(mockedTrack).toHaveBeenCalledWith('about_block_expanded', { source: 'block' })
  })

  it('closing the block sends about_block_closed and says whether it was expanded', () => {
    renderBlock()
    fireEvent.click(screen.getByText('Подробнее ↓'))
    fireEvent.click(screen.getByTitle('Скрыть'))
    expect(mockedTrack).toHaveBeenCalledWith('about_block_closed', { was_expanded: true })
  })
})
