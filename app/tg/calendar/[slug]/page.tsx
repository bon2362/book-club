import TelegramCalendarClient from '@/components/nd/TelegramCalendarClient'

export const dynamic = 'force-dynamic'

export default function TelegramCalendarPage({ params }: { params: { slug: string } }) {
  return <TelegramCalendarClient slug={params.slug} />
}
