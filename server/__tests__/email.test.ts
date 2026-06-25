import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendEmail } from '../email.ts'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('email delivery', () => {
  it('sends through Resend with configured sender', async () => {
    vi.stubEnv('EMAIL_DELIVERY', 'resend')
    vi.stubEnv('RESEND_API_KEY', 're_test_key')
    vi.stubEnv('EMAIL_FROM', 'Open Agricola <no-reply@example.com>')
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await sendEmail({
      to: 'user@example.com',
      subject: 'Verify your email',
      text: 'verify text',
      html: '<p>verify html</p>',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer re_test_key',
          'Content-Type': 'application/json',
        }),
      }),
    )
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body).toEqual({
      from: 'Open Agricola <no-reply@example.com>',
      to: ['user@example.com'],
      subject: 'Verify your email',
      text: 'verify text',
      html: '<p>verify html</p>',
    })
  })

  it('fails fast when Resend config is incomplete', async () => {
    vi.stubEnv('EMAIL_DELIVERY', 'resend')
    vi.stubEnv('RESEND_API_KEY', '')
    vi.stubEnv('EMAIL_FROM', '')

    await expect(sendEmail({
      to: 'user@example.com',
      subject: 'Subject',
      text: 'Text',
      html: '<p>Text</p>',
    })).rejects.toThrow('Resend email delivery requires RESEND_API_KEY and EMAIL_FROM')
  })
})
