export * from '../../shared/events/public-event-presentation'

export type EventNotificationStackItem = {
  id: string
  className: 'private-event-notification' | 'public-event-notification'
  kind: string
  message: string
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
