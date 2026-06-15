const BOT_API = 'https://api.telegram.org'

export async function sendTelegramMessage(chatId: number | string, text: string, loginUrl: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) { console.error('[telegram-bot] no TELEGRAM_BOT_TOKEN'); return }
  try {
    const res = await fetch(`${BOT_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        reply_markup: { inline_keyboard: [[{ text: 'Войти на сайт', url: loginUrl }]] },
      }),
    })
    if (!res.ok) console.error('[telegram-bot] sendMessage failed', { status: res.status })
  } catch (e) {
    console.error('[telegram-bot] sendMessage error', { errorName: (e as Error)?.name })
  }
}
