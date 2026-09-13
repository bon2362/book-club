/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import CollectionStackCard from './CollectionStackCard'

jest.mock('./CoverImage', () => ({
  __esModule: true,
  default: ({ title }: { title: string }) => <span role="img" aria-label={title} />,
}))

it('ведёт на подборку, показывает счётчик и до пяти обложек', () => {
  render(
    <CollectionStackCard
      collection={{
        id: 'c',
        slug: 'tema',
        title: 'Тема',
        textsCount: 7,
        sortAt: '',
        covers: Array.from({ length: 5 }, (_, index) => ({ id: String(index), title: `Книга ${index}`, author: 'А', coverUrl: null })),
      }}
    />,
  )
  expect(screen.getByRole('link')).toHaveAttribute('href', '/collections/tema')
  expect(screen.getByText('7 текстов')).toBeInTheDocument()
  expect(screen.getAllByRole('img')).toHaveLength(5)
})
