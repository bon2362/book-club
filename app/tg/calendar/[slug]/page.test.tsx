import { render, screen } from '@testing-library/react'
import TelegramCalendarPage from './page'

jest.mock('next/script', () => ({
  __esModule: true,
  default: ({ src }: { src: string }) => <div data-testid="telegram-webapp-sdk" data-src={src} />,
}))

jest.mock('@/components/nd/TelegramCalendarClient', () => ({
  __esModule: true,
  default: ({ slug }: { slug: string }) => <div data-testid="telegram-calendar-client">{slug}</div>,
}))

test('подключает Telegram WebApp SDK до календаря', () => {
  render(<TelegramCalendarPage params={{ slug: 'circle' }} />)

  expect(screen.getByTestId('telegram-webapp-sdk')).toHaveAttribute(
    'data-src',
    'https://telegram.org/js/telegram-web-app.js?65',
  )
  expect(screen.getByTestId('telegram-calendar-client')).toHaveTextContent('circle')
})
