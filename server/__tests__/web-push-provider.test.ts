import { createECDH, randomBytes, randomUUID } from 'node:crypto'
import { generateVAPIDKeys } from 'web-push'
import { describe, expect, it, vi } from 'vitest'
import { registerLanguagePack } from '../../shared/i18n'
import { createPushProvider, parsePushSubscription, webPushRuntime } from '../web-push/provider'
import type { PushDelivery } from '../web-push/store'

const deviceKeys = () => ({
  p256dh: createECDH('prime256v1').generateKeys().toString('base64url'),
  auth: randomBytes(16).toString('base64url'),
})

describe('Web Push provider', () => {
  it('posts encrypted bytes to the subscribed provider with the remaining TTL and a stable topic', async () => {
    registerLanguagePack({ version: 1, locale: 'en', messages: { 'webPush.draftNotification': 'You have cards to draft' } })
    const delivery: PushDelivery = {
      deliveryId: randomUUID(), bindingId: randomUUID(), kind: 'draft', expiresAt: Date.now() + 60_000, locale: 'en',
      subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/example-device', keys: deviceKeys() },
    }
    const now = Date.now()
    const provider = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'Retry-After': '5' } }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 410 }))
    const send = createPushProvider({ ...generateVAPIDKeys(), subject: 'mailto:test@example.com' }, provider, () => now)
    expect(await send(delivery, 50)).toEqual({ kind: 'retry', retryAt: now + 5_000 })
    expect(await send(delivery, 45)).toEqual({ kind: 'accepted' })
    expect(await send(delivery, 43)).toEqual({ kind: 'expired' })
    const first = provider.mock.calls[0]
    const second = provider.mock.calls[1]
    expect(String(first?.[0])).toBe(delivery.subscription.endpoint)
    expect(first?.[1]).toMatchObject({ method: 'POST', redirect: 'error' })
    const firstHeaders = new Headers(first?.[1]?.headers)
    expect(firstHeaders.get('Content-Encoding')).toBe('aes128gcm')
    expect(firstHeaders.get('TTL')).toBe('50')
    expect(firstHeaders.get('Topic')).toBe(delivery.deliveryId.replaceAll('-', ''))
    expect(firstHeaders.get('Authorization')).toMatch(/^vapid t=/)
    const secondHeaders = new Headers(second?.[1]?.headers)
    expect(secondHeaders.get('TTL')).toBe('45')
    expect(secondHeaders.get('Topic')).toBe(firstHeaders.get('Topic'))
    expect(secondHeaders.get('Authorization')).toBe(firstHeaders.get('Authorization'))
    expect(first?.[1]?.body).toBeInstanceOf(Uint8Array)
    expect(String(first?.[1]?.body)).not.toContain('You have cards to draft')
  })

  it('rejects arbitrary hosts and credentials at subscription intake', () => {
    const keys = deviceKeys()
    expect(parsePushSubscription({ keys, endpoint: 'https://web.push.apple.com/test' })).not.toBeNull()
    expect(parsePushSubscription({ keys, endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/test' })).not.toBeNull()
    expect(parsePushSubscription({ keys, endpoint: 'https://localhost/fcm/send/test' })).toBeNull()
    expect(parsePushSubscription({ keys, endpoint: 'https://fcm.googleapis.com@example.org/fcm/send/test' })).toBeNull()
  })

  it('keeps preferences unavailable without matching credentials and allows the categories independently', () => {
    const keys = generateVAPIDKeys()
    const env = { WEB_PUSH_DRAFT_ENABLED: 'true', WEB_PUSH_VAPID_PUBLIC_KEY: keys.publicKey,
      WEB_PUSH_VAPID_PRIVATE_KEY: keys.privateKey, WEB_PUSH_VAPID_SUBJECT: 'mailto:test@example.com' }
    expect(webPushRuntime(env).allowed).toEqual({ draft: true, 'bug-report-inbox': false })
    expect(webPushRuntime({ ...env, WEB_PUSH_VAPID_PUBLIC_KEY: generateVAPIDKeys().publicKey }).publicKey).toBeNull()
    expect(webPushRuntime({ ...env, RELEASE_CHANNEL: 'prerelease' }).allowed).toEqual({ draft: false, 'bug-report-inbox': false })
  })
})
