export type SendEmailInput = {
  to: string
  subject: string
  text: string
  html: string
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const delivery = process.env.EMAIL_DELIVERY || 'log'
  if (delivery === 'log') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('EMAIL_DELIVERY must be set to resend in production')
    }
    console.log(`[email] to=${input.to} subject=${input.subject}\n${input.text}`)
    return
  }

  if (delivery !== 'resend') {
    throw new Error(`Unsupported EMAIL_DELIVERY: ${delivery}`)
  }

  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!apiKey || !from) {
    throw new Error('Resend email delivery requires RESEND_API_KEY and EMAIL_FROM')
  }

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  })

  if (!resp.ok) {
    throw new Error(`Resend email delivery failed with HTTP ${resp.status}`)
  }
}
