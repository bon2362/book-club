import Script from 'next/script'
import TelegramCalendarClient from '@/components/nd/TelegramCalendarClient'

export const dynamic = 'force-dynamic'

export default function TelegramCalendarPage({ params }: { params: { slug: string } }) {
  return <>
    <Script src="https://telegram.org/js/telegram-web-app.js?65" strategy="beforeInteractive" />
    <TelegramCalendarClient slug={params.slug} />
  </>
}
