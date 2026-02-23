/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import CoverImage from './CoverImage'

jest.mock('@/lib/covers', () => ({
  getInitials: (author: string) => author.split(/\s+/).slice(0,2).map((w:string) => w[0]?.toUpperCase() ?? '').join('')
}))

describe('CoverImage', () => {
  it('renders an img tag when coverUrl is provided', () => {
    render(
      <CoverImage
        coverUrl="https://example.com/cover.jpg"
        title="Sapiens"
        author="Yuval Noah Harari"
      />
    )
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', 'https://example.com/cover.jpg')
    expect(img).toHaveAttribute('alt', 'Обложка: Sapiens')
  })

  it('renders author initials when coverUrl is null', () => {
    render(
      <CoverImage
        coverUrl={null}
        title="Капитал"
        author="Karl Marx"
      />
    )
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('KM')).toBeInTheDocument()
  })

  it('renders initials for Russian author', () => {
    render(
      <CoverImage
        coverUrl={null}
        title="Тест"
        author="Иван Иванов"
      />
    )
    expect(screen.getByText('ИИ')).toBeInTheDocument()
  })
})
