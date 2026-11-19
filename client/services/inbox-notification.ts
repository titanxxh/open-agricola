export const WEB_PUSH_INBOX_EVENT = 'open-agricola:web-push-inbox'

export type InboxNotificationTarget = { userId: string; messageId: number | null }

export function openInboxNotification(target: InboxNotificationTarget): void {
  window.dispatchEvent(new CustomEvent(WEB_PUSH_INBOX_EVENT, { detail: target }))
}

export function inboxNotificationTarget(event: Event): InboxNotificationTarget | null {
  if (!(event instanceof CustomEvent)) return null
  const target: unknown = event.detail
  if (!target || typeof target !== 'object' || !('userId' in target) || typeof target.userId !== 'string'
    || !('messageId' in target)) return null
  const { messageId } = target
  if (messageId !== null && (typeof messageId !== 'number' || !Number.isSafeInteger(messageId) || messageId < 1)) return null
  return { userId: target.userId, messageId }
}
