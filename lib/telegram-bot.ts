const BOT_API = 'https://api.telegram.org'

export async function sendTelegramMessage(chatId: number | string, text: string, loginUrl?: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) { console.error('[telegram-bot] no TELEGRAM_BOT_TOKEN'); return }
  try {
    const body: Record<string, unknown> = { chat_id: chatId, text }
    if (loginUrl) {
      body.reply_markup = { inline_keyboard: [[{ text: 'Войти на сайт', url: loginUrl }]] }
    }
    const res = await fetch(`${BOT_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) console.error('[telegram-bot] sendMessage failed', { status: res.status })
  } catch (e) {
    console.error('[telegram-bot] sendMessage error', { errorName: (e as Error)?.name })
  }
}
