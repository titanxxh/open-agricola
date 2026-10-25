import { t as translateMessage } from '../../shared/i18n'
import type { PrivateGameEvent } from '../../shared/contract/protocol/game'
import type { Locale } from '../../shared/i18n'

export type PrivateEventNotification = {
  id: string
  recipientPlayerId: string
  kind: 'prompt' | 'draft' | 'hand'
  message: string
}

const cardTypeLabel = (cardType: 'minor' | 'occupation' | 'mixed', locale: Locale): string => translateMessage(locale, `ui.private.cardType.${cardType}`)

export const privateEventSignature = (event: PrivateGameEvent): string => {
  if (event.type === 'private.handChanged') {
    return [
      event.type,
      event.recipientPlayerId,
      event.reason,
      event.cardType,
      event.cardIds.length,
      event.sourceCard ?? '',
      event.sourceActionId ?? '',
    ].join('|')
  }
  if (event.type === 'private.draftUpdated') {
    return [
      event.type,
      event.recipientPlayerId,
      event.round,
      event.advanced ? 'advanced' : 'same',
      event.finished ? 'finished' : 'active',
      event.picked?.occCardId ?? '',
      event.picked?.minorCardId ?? '',
    ].join('|')
  }
  return [
    event.type,
    event.recipientPlayerId,
    event.promptKind,
    event.sourceCard ?? '',
    event.sourceActionId ?? '',
    event.promptKey ?? '',
  ].join('|')
}

const messageForPrivateEvent = (event: PrivateGameEvent, locale: Locale): PrivateEventNotification['message'] => {
  if (event.type === 'private.handChanged') {
    const count = event.cardIds.length
    const cardType = cardTypeLabel(event.cardType, locale)
    return translateMessage(locale, 'ui.private.handUpdated', { count, cardType, plural: count === 1 ? '' : 's' })
  }
  if (event.type === 'private.draftUpdated') {
    if (event.finished) return translateMessage(locale, "ui.copy.app_private_event_notifications.draft_finished_your_hand_was_updated_1dae3a")
    if (event.advanced) return translateMessage(locale, "ui.copy.app_private_event_notifications.draft_advanced_to_round_cbfbec", { value0: event.round + 1 })
    return translateMessage(locale, "ui.copy.app_private_event_notifications.draft_pick_submitted_8a4d26")
  }
  if (event.sourceCard) {
    return translateMessage(locale, "ui.copy.app_private_event_notifications.private_prompt_from_bdeb1d", { value0: event.sourceCard })
  }
  return translateMessage(locale, "ui.copy.app_private_event_notifications.private_prompt_needs_your_response_cb8048")
}

const kindForPrivateEvent = (event: PrivateGameEvent): PrivateEventNotification['kind'] => {
  if (event.type === 'private.handChanged') return 'hand'
  if (event.type === 'private.draftUpdated') return 'draft'
  return 'prompt'
}

export const collectPrivateEventNotifications = (
  events: readonly PrivateGameEvent[],
  locale: Locale,
  idPrefix = '',
): PrivateEventNotification[] => {
  const notifications: PrivateEventNotification[] = []
  const seenSignatures = new Set<string>()
  for (const event of events) {
    const signature = privateEventSignature(event)
    if (seenSignatures.has(signature)) continue
    seenSignatures.add(signature)
    notifications.push({
      id: idPrefix ? `${idPrefix}:${signature}` : signature,
      recipientPlayerId: event.recipientPlayerId,
      kind: kindForPrivateEvent(event),
      message: messageForPrivateEvent(event, locale),
    })
  }
  return notifications
}
