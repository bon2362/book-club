/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import AboutBlock from './AboutBlock'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

beforeEach(() => {
  localStorageMock.clear()
})

describe('nd/AboutBlock', () => {
  it('renders the block with L1 text and eyebrow', () => {
    render(<AboutBlock onClose={() => {}} />)
    expect(screen.getByRole('region', { name: 'Читательские круги' })).toBeInTheDocument()
    expect(screen.getByText('Что это')).toBeInTheDocument()
    expect(screen.getByText(/Мы собираемся небольшими группами/)).toBeInTheDocument()
  })

  it('accordion is closed initially', () => {
    render(<AboutBlock onClose={() => {}} />)
    expect(screen.queryByText('Что это?')).not.toBeInTheDocument()
  })

  it('clicking the L1 block area opens the accordion', () => {
    render(<AboutBlock onClose={() => {}} />)
    // Click on the region itself (not a button inside it)
    const region = screen.getByRole('region', { name: 'Читательские круги' })
    fireEvent.click(region)
    expect(screen.getByText('Что это?')).toBeInTheDocument()
  })

  it('clicking "Подробнее ↓" opens the accordion', () => {
    render(<AboutBlock onClose={() => {}} />)
    fireEvent.click(screen.getByText('Подробнее ↓'))
    expect(screen.getByText('Что это?')).toBeInTheDocument()
  })

  it('clicking a section question opens it', () => {
    render(<AboutBlock onClose={() => {}} />)
    // Open accordion first
    fireEvent.click(screen.getByText('Подробнее ↓'))

    const btn = screen.getByRole('button', { name: /Что это\?/ })
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByText(/Мы собираемся небольшими группами по 3-4 человека/).length).toBeGreaterThanOrEqual(1)
  })

  it('clicking another section closes the first', () => {
    render(<AboutBlock onClose={() => {}} />)
    fireEvent.click(screen.getByText('Подробнее ↓'))

    const btn1 = screen.getByRole('button', { name: /Что это\?/ })
    const btn2 = screen.getByRole('button', { name: /Как это устроено\?/ })

    fireEvent.click(btn1)
    expect(btn1).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(btn2)
    expect(btn1).toHaveAttribute('aria-expanded', 'false')
    expect(btn2).toHaveAttribute('aria-expanded', 'true')
  })

  it('clicking an open section closes it', () => {
    render(<AboutBlock onClose={() => {}} />)
    fireEvent.click(screen.getByText('Подробнее ↓'))

    const btn = screen.getByRole('button', { name: /Что это\?/ })
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'false')
  })

  it('clicking × calls onClose', () => {
    const onClose = jest.fn()
    render(<AboutBlock onClose={onClose} />)
    fireEvent.click(screen.getByTitle('Скрыть'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('× button does not propagate to block click handler', () => {
    const onClose = jest.fn()
    render(<AboutBlock onClose={onClose} />)
    // After clicking ×, accordion should NOT open (stopPropagation works)
    fireEvent.click(screen.getByTitle('Скрыть'))
    expect(screen.queryByText('Что это?')).not.toBeInTheDocument()
    expect(onClose).toHaveBeenCalled()
  })

  it('renders all 5 accordion sections when accordion is open', () => {
    render(<AboutBlock onClose={() => {}} />)
    fireEvent.click(screen.getByText('Подробнее ↓'))
    expect(screen.getByText('Что это?')).toBeInTheDocument()
    expect(screen.getByText('Как это устроено?')).toBeInTheDocument()
    expect(screen.getByText('Для кого это?')).toBeInTheDocument()
    expect(screen.getByText('Почему именно демократия?')).toBeInTheDocument()
    expect(screen.getByText('Чем это не является?')).toBeInTheDocument()
  })

  it('open section is reset when accordion is collapsed and reopened', () => {
    render(<AboutBlock onClose={() => {}} />)
    fireEvent.click(screen.getByText('Подробнее ↓'))
    const btn = screen.getByRole('button', { name: /Что это\?/ })
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    // Collapse accordion
    fireEvent.click(screen.getByText('Свернуть ↑'))
    // Reopen accordion
    fireEvent.click(screen.getByText('Подробнее ↓'))
    // Section should be closed again
    const btn2 = screen.getByRole('button', { name: /Что это\?/ })
    expect(btn2).toHaveAttribute('aria-expanded', 'false')
  })

  it('Enter key on L1 block opens accordion when closed', () => {
    render(<AboutBlock onClose={() => {}} />)
    const region = screen.getByRole('region', { name: 'Читательские круги' })
    fireEvent.keyDown(region, { key: 'Enter' })
    expect(screen.getByText('Что это?')).toBeInTheDocument()
  })

  // Note: localStorage-based hiding (aboutDismissed=true) and localStorage write on ×
  // are tested at the BooksPage level, where that logic lives (handleCloseAbout / aboutVisible state).
})
