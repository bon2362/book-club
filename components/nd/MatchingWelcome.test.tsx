import { render, screen } from '@testing-library/react'
import MatchingWelcome from './MatchingWelcome'
import { SPECIES_PHOTOS } from '@/lib/matching/species-images.generated'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}))
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(props as Record<string, string>)} />
  },
}))

const withPhoto = Object.keys(SPECIES_PHOTOS)[0]

describe('MatchingWelcome иллюстрация ника', () => {
  it('рендерит фото для ника, у которого оно есть', () => {
    render(<MatchingWelcome sessionId="s1" sessionName="Тест" pseudonym={withPhoto} />)
    const img = screen.getByTestId('welcome-species-photo')
    expect(img).toBeInTheDocument()
    expect(img.getAttribute('src')).toContain(SPECIES_PHOTOS[withPhoto].file)
    expect(screen.getByText(/фото:/i)).toBeInTheDocument()
  })

  it('рендерит букву-глиф для ника без фото', () => {
    render(<MatchingWelcome sessionId="s1" sessionName="Тест" pseudonym="__нет-такого-вида__" />)
    expect(screen.queryByTestId('welcome-species-photo')).not.toBeInTheDocument()
    expect(screen.getByTestId('welcome-species-glyph')).toBeInTheDocument()
  })
})
