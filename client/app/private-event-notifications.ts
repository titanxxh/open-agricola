import type { PrivateGameEvent } from '../../shared/contract/protocol/game'
import type { Locale } from '../../shared/i18n'

export type PrivateEventNotification = {
  id: string
  kind: 'prompt' | 'draft' | 'hand'
  message: string
}

const cardTypeLabel = (cardType: 'minor' | 'occupation' | 'mixed', locale: Locale): string => {
  if (locale === 'zh') {
    if (cardType === 'occupation') return '职业'
    if (cardType === 'minor') return '小改良'
    return '卡牌'
  }
  if (cardType === 'occupation') return 'occupation'
  if (cardType === 'minor') return 'minor improvement'
  return 'card'
}

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
    if (locale === 'zh') return `手牌已更新：${count} 张${cardType}`
    return `Hand updated: ${count} ${cardType}${count === 1 ? '' : 's'}`
  }
  if (event.type === 'private.draftUpdated') {
    if (event.finished) return locale === 'zh' ? '轮抽完成，手牌已更新' : 'Draft finished. Your hand was updated.'
    if (event.advanced) return locale === 'zh' ? `轮抽进入第 ${event.round + 1} 轮` : `Draft advanced to round ${event.round + 1}.`
    return locale === 'zh' ? '本轮选择已提交' : 'Draft pick submitted.'
  }
  if (event.sourceCard) {
    return locale === 'zh'
      ? `需要处理 ${event.sourceCard} 的私有提示`
      : `Private prompt from ${event.sourceCard}.`
  }
  return locale === 'zh' ? '需要处理私有提示' : 'Private prompt needs your response.'
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
      kind: kindForPrivateEvent(event),
      message: messageForPrivateEvent(event, locale),
    })
  }
  return notifications
}
