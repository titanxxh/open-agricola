export const WEB_PUSH_KINDS = ['draft', 'bug-report-inbox'] as const
export type WebPushKind = typeof WEB_PUSH_KINDS[number]
export type WebPushPreferences = Record<WebPushKind, boolean>

export type BrowserPushSubscription = {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export type WebPushTarget =
  | { kind: 'draft'; roomId: string }
  | { kind: 'bug-report-inbox'; messageId: number }
  | { kind: 'unavailable' }

export type WebPushPayload = {
  kind: WebPushKind
  deliveryId: string
  /**
   * Generic localized copy for the category, never the message, report, room or player. Current Workers show it as
   * the body under the site name; Workers installed before that change show it as the title, so it reads on its own.
   */
  title: string
}

export const WEB_PUSH_DEVICE_PATH = '/api/v1/web-push/device'
export const WEB_PUSH_CLICK_PATH = '/api/v1/web-push/click'
export const WEB_PUSH_UNBIND_PATH = '/api/v1/web-push/unbind'
export const WEB_PUSH_CLICK_MESSAGE = 'open-agricola:web-push-click'
export const emptyWebPushPreferences = (): WebPushPreferences => ({ draft: false, 'bug-report-inbox': false })

export const isWebPushKind = (value: unknown): value is WebPushKind => value === 'draft' || value === 'bug-report-inbox'
export const isWebPushId = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)

export type WebPushClick = { kind: WebPushKind; deliveryId: string }

export function parseWebPushClick(value: unknown): WebPushClick | null {
  if (!value || typeof value !== 'object' || !('kind' in value) || !isWebPushKind(value.kind)
    || !('deliveryId' in value) || !isWebPushId(value.deliveryId)) return null
  return { kind: value.kind, deliveryId: value.deliveryId }
}
