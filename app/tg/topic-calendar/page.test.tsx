import { render, screen } from '@testing-library/react'
import TelegramTopicCalendarPage from './page'

jest.mock('next/script', () => ({
  __esModule: true,
  default: ({ src }: { src: string }) => <div data-testid="telegram-webapp-sdk" data-src={src} />,
}))

jest.mock('@/components/nd/TelegramTopicCalendarClient', () => ({
  __esModule: true,
  default: () => <div data-testid="telegram-topic-calendar-client" />,
}))

test('подключает Telegram WebApp SDK до загрузчика календаря темы', () => {
  render(<TelegramTopicCalendarPage />)
  expect(screen.getByTestId('telegram-webapp-sdk')).toHaveAttribute('data-src', 'https://telegram.org/js/telegram-web-app.js?65')
  expect(screen.getByTestId('telegram-topic-calendar-client')).toBeInTheDocument()
})
