import { createECDH, randomBytes, randomUUID } from 'node:crypto'
import { encrypt, generateVAPIDKeys } from 'web-push'
import { describe, expect, it, vi } from 'vitest'
import '../language-packs'
import type { WebPushKind } from '../../shared/contract/web-push'
import { createPushProvider, parsePushSubscription, webPushRuntime } from '../web-push/provider'
import type { PushDelivery } from '../web-push/store'

vi.mock('web-push', async importOriginal => {
  const actual = await importOriginal<typeof import('web-push')>()
  return { ...actual, encrypt: vi.fn(actual.encrypt) }
})

const deviceKeys = () => ({
  p256dh: createECDH('prime256v1').generateKeys().toString('base64url'),
  auth: randomBytes(16).toString('base64url'),
})

describe('Web Push provider', () => {
  it('posts encrypted bytes to the subscribed provider with the remaining TTL and a stable topic', async () => {
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
    expect(String(first?.[1]?.body)).not.toContain("It's your turn to pick cards in the draft.")
  })

  it.each<[WebPushKind, string, string]>([
    ['turn', 'en', 'It’s your turn to act.'],
    ['turn', 'zh', '轮到你行动了'],
    ['draft', 'en', "It's your turn to pick cards in the draft."],
    ['draft', 'zh', '轮到你在轮抽中选牌了'],
    ['bug-report-inbox', 'en', 'Your Bug Report has a new reply. Open it to view.'],
    ['bug-report-inbox', 'zh', '你的 Bug Report 有新回复，点开查看'],
    ['bug-report-inbox', 'fr', 'Your Bug Report has a new reply. Open it to view.'],
  ])('encrypts only the %s category, the delivery ID and generic %s copy', async (kind, locale, title) => {
    vi.mocked(encrypt).mockClear()
    const delivery: PushDelivery = {
      deliveryId: randomUUID(), bindingId: randomUUID(), kind, expiresAt: Date.now() + 60_000, locale,
      subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/example-device', keys: deviceKeys() },
    }
    const send = createPushProvider({ ...generateVAPIDKeys(), subject: 'mailto:test@example.com' },
      vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 201 })))
    expect(await send(delivery, 60)).toEqual({ kind: 'accepted' })
    const [[, , plaintext]] = vi.mocked(encrypt).mock.calls as [[string, string, string, string]]
    // The exact object: no report title, message, room or player can ride along, and old Workers read every field.
    expect(JSON.parse(plaintext)).toStrictEqual({ kind, deliveryId: delivery.deliveryId, title })
  })

  it('rejects arbitrary hosts and credentials at subscription intake', () => {
    const keys = deviceKeys()
    expect(parsePushSubscription({ keys, endpoint: 'https://web.push.apple.com/test' })).not.toBeNull()
    expect(parsePushSubscription({ keys, endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/test' })).not.toBeNull()
    expect(parsePushSubscription({ keys, endpoint: 'https://jmt17.google.com/fcm/send/test' })).not.toBeNull()
    expect(parsePushSubscription({ keys, endpoint: 'https://jmt17.google.com/other/test' })).toBeNull()
    expect(parsePushSubscription({ keys, endpoint: 'https://google.com/fcm/send/test' })).toBeNull()
    expect(parsePushSubscription({ keys, endpoint: 'https://evil.google.com.example.org/fcm/send/test' })).toBeNull()
    expect(parsePushSubscription({ keys, endpoint: 'https://localhost/fcm/send/test' })).toBeNull()
    expect(parsePushSubscription({ keys, endpoint: 'https://fcm.googleapis.com@example.org/fcm/send/test' })).toBeNull()
  })

  it('makes all categories available with valid credentials on stable deployments', () => {
    const keys = generateVAPIDKeys()
    const env = { WEB_PUSH_VAPID_PUBLIC_KEY: keys.publicKey, WEB_PUSH_VAPID_PRIVATE_KEY: keys.privateKey,
      WEB_PUSH_VAPID_SUBJECT: 'mailto:test@example.com' }
    expect(webPushRuntime(env)).toMatchObject({
      publicKey: keys.publicKey, allowed: { turn: true, draft: true, 'bug-report-inbox': true }, send: expect.any(Function),
    })
    const unavailable = { publicKey: null, allowed: { turn: false, draft: false, 'bug-report-inbox': false }, send: null }
    expect(webPushRuntime({})).toEqual(unavailable)
    expect(webPushRuntime({ ...env, WEB_PUSH_VAPID_PUBLIC_KEY: generateVAPIDKeys().publicKey })).toEqual(unavailable)
    expect(webPushRuntime({ ...env, RELEASE_CHANNEL: 'prerelease' })).toEqual(unavailable)
  })
})
