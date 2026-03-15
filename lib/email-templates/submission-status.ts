const WRAPPER_OPEN = `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F5F0;font-family:system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F0;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border:1px solid #E5E5E5;border-top:3px solid #111;">
        <tr><td style="padding:36px 36px 0">
          <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#999;">Книжный клуб</p>
          <h1 style="margin:0 0 24px;font-family:Georgia,serif;font-size:26px;font-weight:700;color:#111;letter-spacing:-0.02em;">Долгое наступление</h1>`

const WRAPPER_CLOSE = `
        </td></tr>
        <tr><td style="padding:20px 36px;border-top:1px solid #E5E5E5;">
          <p style="margin:0;font-size:12px;color:#bbb;line-height:1.5;">
            Это автоматическое уведомление — отвечать на него не нужно.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

export function approvedEmail(bookTitle: string): { subject: string; html: string } {
  return {
    subject: `Ваша заявка на книгу одобрена`,
    html: `${WRAPPER_OPEN}
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#444;">
            Ваша заявка на книгу <strong>«${bookTitle}»</strong> одобрена.
          </p>
          <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#444;">
            Книга появится в каталоге клуба. Спасибо за вклад!
          </p>
${WRAPPER_CLOSE}`,
  }
}

export function rejectedEmail(bookTitle: string, rejectionReason?: string | null): { subject: string; html: string } {
  const reasonBlock = rejectionReason
    ? `<p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#444;">
            Причина: ${rejectionReason}
          </p>`
    : `<p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#444;">
            Спасибо, что предложили её клубу.
          </p>`
  return {
    subject: `Статус вашей заявки на книгу обновлён`,
    html: `${WRAPPER_OPEN}
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#444;">
            Ваша заявка на книгу <strong>«${bookTitle}»</strong> не была одобрена.
          </p>
          ${reasonBlock}
${WRAPPER_CLOSE}`,
  }
}
