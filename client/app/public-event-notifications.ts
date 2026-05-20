import type { GameEvent } from '../../shared/contract/events'
import { resourceKeyList } from '../../shared/contract/state-constants'
import type { Resource } from '../../shared/contract/types'
import { t, type Locale } from '../../shared/i18n'

export type PublicEventNotification = {
  id: string
  kind: 'resource' | 'payment' | 'action' | 'future' | 'farm'
  message: string
}

export type PublicEventNotificationBatch = {
  notifications: PublicEventNotification[]
  nextCursor: number | null
}

export type EventNotificationStackItem = {
  id: string
  className: 'private-event-notification' | 'public-event-notification'
  kind: string
  message: string
}

const positiveResources = (resources: Partial<Resource>): Partial<Resource> =>
  Object.fromEntries(
    resourceKeyList
      .map((key) => [key, resources[key] ?? 0] as const)
      .filter(([, amount]) => amount > 0),
  ) as Partial<Resource>

const resourceText = (resources: Partial<Resource>, locale: Locale): string =>
  resourceKeyList
    .filter((key) => (resources[key] ?? 0) > 0)
    .map((key) => `${resources[key]} ${t(locale, `resources.${key}`)}`)
    .join(' · ')

const actionLabel = (event: GameEvent): string =>
  'actionId' in event ? event.actionId : event.sourceActionId ?? ''

const messageForPublicEvent = (event: GameEvent, locale: Locale): PublicEventNotification | null => {
  if (event.type === 'resource.exchanged') {
    const paid = resourceText(positiveResources(event.paid), locale)
    const gained = resourceText(positiveResources(event.gained), locale)
    return {
      id: event.id,
      kind: 'resource',
      message: locale === 'zh'
        ? `资源交换：${paid} -> ${gained}`
        : `Resources exchanged: ${paid} -> ${gained}`,
    }
  }
  if (event.type === 'resource.paid') {
    const paid = resourceText(positiveResources(event.resources), locale)
    return {
      id: event.id,
      kind: 'payment',
      message: locale === 'zh' ? `支付资源：${paid}` : `Resources paid: ${paid}`,
    }
  }
  if (event.type === 'action.revealed') {
    return {
      id: event.id,
      kind: 'action',
      message: locale === 'zh' ? `行动格已揭示：${event.actionId}` : `Action revealed: ${event.actionId}`,
    }
  }
  if (event.type === 'action.exclusiveUseSet' || event.type === 'action.exclusiveUseCleared') {
    const action = actionLabel(event)
    return {
      id: event.id,
      kind: 'action',
      message: event.type === 'action.exclusiveUseSet'
        ? (locale === 'zh' ? `行动格被保留：${action}` : `Action reserved: ${action}`)
        : (locale === 'zh' ? `行动格保留已清除：${action}` : `Action reservation cleared: ${action}`),
    }
  }
  if (event.type === 'futureMeeple.queued') {
    return {
      id: event.id,
      kind: 'future',
      message: locale === 'zh' ? `已安排未来工人：${event.cardId}` : `Future worker queued: ${event.cardId}`,
    }
  }
  if (event.type === 'farm.fenceBuilt') {
    return {
      id: event.id,
      kind: 'farm',
      message: locale === 'zh' ? '农场围栏已更新' : 'Farm fences updated',
    }
  }
  return null
}

export const collectPublicEventNotifications = (
  events: readonly GameEvent[],
  locale: Locale,
  idPrefix = '',
): PublicEventNotification[] => {
  const notifications: PublicEventNotification[] = []
  const seen = new Set<string>()
  for (const event of events) {
    const key = event.id || String(event.seq)
    if (seen.has(key)) continue
    seen.add(key)
    const notification = messageForPublicEvent(event, locale)
    if (!notification) continue
    notifications.push({
      ...notification,
      id: idPrefix ? `${idPrefix}:${notification.id}` : notification.id,
    })
  }
  return notifications
}

export const collectNewPublicEventNotifications = (
  events: readonly GameEvent[],
  lastSeenSeq: number | null,
  locale: Locale,
  idPrefix = '',
): PublicEventNotificationBatch => {
  const maxSeq = events.reduce((max, event) => Math.max(max, event.seq), 0)
  if (lastSeenSeq === null || maxSeq < lastSeenSeq) {
    return { notifications: [], nextCursor: maxSeq }
  }
  const nextEvents = events.filter((event) => event.seq > lastSeenSeq)
  return {
    notifications: collectPublicEventNotifications(nextEvents, locale, idPrefix),
    nextCursor: maxSeq,
  }
}

export const buildEventNotificationStackItems = (
  privateNotifications: readonly { id: string; kind: string; message: string }[],
  publicNotifications: readonly { id: string; kind: string; message: string }[],
): EventNotificationStackItem[] => [
  ...privateNotifications.map((notification) => ({
    id: notification.id,
    className: 'private-event-notification' as const,
    kind: notification.kind,
    message: notification.message,
  })),
  ...publicNotifications.map((notification) => ({
    id: notification.id,
    className: 'public-event-notification' as const,
    kind: notification.kind,
    message: notification.message,
  })),
]
