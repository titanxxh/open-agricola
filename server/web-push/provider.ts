import { createECDH } from 'node:crypto'
import { encrypt, getVapidHeaders } from 'web-push'
import { t } from '../../shared/i18n'
import { type BrowserPushSubscription, type WebPushPayload, type WebPushPreferences } from '../../shared/contract/web-push'
import type { PushProvider } from './delivery'

type Vapid = { subject: string; publicKey: string; privateKey: string }

function pushEndpoint(value: string): URL | null {
  const url = URL.parse(value)
  if (!url || url.href !== value || url.protocol !== 'https:' || url.port || url.username || url.password || url.hash
    || url.pathname === '/' || url.href.length > 2_048) return null
  if ((url.hostname === 'fcm.googleapis.com' && /^\/(?:fcm\/send|wp)\//.test(url.pathname))
    || (url.hostname === 'updates.push.services.mozilla.com' && /^\/(?:wpush|push)\/v[0-9]+\//.test(url.pathname))
    || /^[a-z0-9-]+\.push\.apple\.com$/.test(url.hostname)
    || /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname)) return url
  return null
}

export function parsePushSubscription(value: unknown): BrowserPushSubscription | null {
  if (!value || typeof value !== 'object' || !('endpoint' in value) || typeof value.endpoint !== 'string' || !pushEndpoint(value.endpoint)
    || !('keys' in value) || !value.keys || typeof value.keys !== 'object') return null
  const { keys } = value
  if (!('p256dh' in keys) || typeof keys.p256dh !== 'string' || !/^[A-Za-z0-9_-]{87}$/.test(keys.p256dh)
    || !('auth' in keys) || typeof keys.auth !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(keys.auth)
    || Buffer.from(keys.p256dh, 'base64url')[0] !== 4) return null
  return { endpoint: value.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }
}

function vapidFromEnv(env: NodeJS.ProcessEnv): Vapid | null {
  const subject = env.WEB_PUSH_VAPID_SUBJECT?.trim()
  const publicKey = env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim()
  const privateKey = env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim()
  if (!subject || !publicKey || !privateKey || !/^[A-Za-z0-9_-]{87}$/.test(publicKey) || !/^[A-Za-z0-9_-]{43}$/.test(privateKey)) return null
  const url = URL.parse(subject)
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'mailto:') || url.hostname === 'localhost') return null
  try {
    const key = createECDH('prime256v1')
    key.setPrivateKey(Buffer.from(privateKey, 'base64url'))
    if (key.getPublicKey().toString('base64url') !== publicKey) return null
    getVapidHeaders('https://fcm.googleapis.com', subject, publicKey, privateKey, 'aes128gcm')
  } catch { return null }
  return { subject, publicKey, privateKey }
}

function retryAt(value: string | null, now: number) {
  if (!value) return undefined
  const millis = /^\d+$/.test(value) ? now + Number(value) * 1_000 : Date.parse(value)
  return Number.isSafeInteger(millis) ? millis : undefined
}

export function createPushProvider(vapid: Vapid, request = fetch, now = Date.now): PushProvider {
  const headersByOrigin = new Map<string, { authorization: string; expiresAt: number }>()
  return async (delivery, ttl) => {
    const endpoint = pushEndpoint(delivery.subscription.endpoint)
    if (!endpoint) return { kind: 'discarded' }
    const { kind, locale, deliveryId } = delivery
    const key = kind === 'draft' ? 'webPush.draftNotification' : 'webPush.inboxNotification'
    const localizedTitle = t(locale, key)
    const englishTitle = t('en', key)
    const payload: WebPushPayload = {
      kind, deliveryId, title: localizedTitle !== key ? localizedTitle : englishTitle !== key ? englishTitle : 'Open Agricola',
    }
    let authorization = headersByOrigin.get(endpoint.origin)
    if (!authorization || authorization.expiresAt <= now()) {
      const headers = getVapidHeaders(endpoint.origin, vapid.subject, vapid.publicKey, vapid.privateKey, 'aes128gcm')
      authorization = { authorization: headers.Authorization, expiresAt: now() + 60 * 60 * 1_000 }
      headersByOrigin.set(endpoint.origin, authorization)
    }

    let body: Uint8Array<ArrayBuffer>
    try {
      const { p256dh, auth } = delivery.subscription.keys
      body = new Uint8Array(encrypt(p256dh, auth, JSON.stringify(payload), 'aes128gcm').cipherText)
    } catch { return { kind: 'discarded' } }

    const result = await request(endpoint, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000), body,
      headers: {
        'Content-Type': 'application/octet-stream', 'Content-Encoding': 'aes128gcm',
        Authorization: authorization.authorization, TTL: String(ttl), Urgency: 'normal', Topic: deliveryId.replaceAll('-', ''),
      },
    })
    await result.body?.cancel()
    if (result.ok) return { kind: 'accepted' }
    if (result.status === 404 || result.status === 410) return { kind: 'expired' }
    if (result.status === 408 || result.status === 429 || result.status >= 500) {
      return { kind: 'retry', retryAt: retryAt(result.headers.get('Retry-After'), now()) }
    }
    return { kind: 'discarded' }
  }
}

export function webPushRuntime(env = process.env): { publicKey: string | null; allowed: WebPushPreferences; send: PushProvider | null } {
  const vapid = env.RELEASE_CHANNEL === 'prerelease' ? null : vapidFromEnv(env)
  return {
    publicKey: vapid?.publicKey ?? null,
    allowed: { draft: !!vapid && env.WEB_PUSH_DRAFT_ENABLED === 'true',
      'bug-report-inbox': !!vapid && env.WEB_PUSH_INBOX_ENABLED === 'true' },
    send: vapid ? createPushProvider(vapid) : null,
  }
}
