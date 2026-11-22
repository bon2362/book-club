import Script from 'next/script'
import TelegramTopicCalendarClient from '@/components/nd/TelegramTopicCalendarClient'

export const dynamic = 'force-dynamic'

/**
 * Main Mini App бота (URL указывается в BotFather). Открывается Direct Link'ом
 * `t.me/<bot>?startapp=calendar_<bindingId>` из сообщения темы группы.
 */
export default function TelegramTopicCalendarPage() {
  return <>
    <Script src="https://telegram.org/js/telegram-web-app.js?65" strategy="beforeInteractive" />
    <TelegramTopicCalendarClient />
  </>
}
