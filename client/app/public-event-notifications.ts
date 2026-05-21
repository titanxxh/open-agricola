import type { GameEvent, ResourceLocation } from '../../shared/contract/events'
import { resourceKeyList } from '../../shared/contract/state-constants'
import type { Resource } from '../../shared/contract/types'
import { t, type Locale } from '../../shared/i18n'

export type PublicEventNotification = {
  id: string
  kind: 'resource' | 'payment' | 'action' | 'future' | 'farm' | 'card'
  message: string
}

export type PublicEventNotificationBatch = {
  notifications: PublicEventNotification[]
  nextCursor: number | null
}

export type PublicEventFarmTileHighlightTarget = { playerId: string; key: string }
export type PublicEventFenceEdgeHighlightTarget = { playerId: string; edgeId: string }

export type PublicEventHighlightTargets = {
  actionIds: string[]
  farmTiles: PublicEventFarmTileHighlightTarget[]
  fenceEdges: PublicEventFenceEdgeHighlightTarget[]
}

export type PublicEventResourceAnimationEndpoint =
  | { kind: 'actionSpace'; actionId: string }
  | { kind: 'playerResources'; playerId: string }
  | { kind: 'farmTile'; playerId: string; key: string }
  | { kind: 'supply' }

export type PublicEventResourceAnimation = {
  id: string
  resources: Partial<Resource>
  from: PublicEventResourceAnimationEndpoint
  to: PublicEventResourceAnimationEndpoint
  kind: 'move' | 'exchange' | 'payment'
}

export type PublicEventFeedbackBatch = PublicEventNotificationBatch & {
  highlights: PublicEventHighlightTargets
  resourceAnimations: PublicEventResourceAnimation[]
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

const accumulationTargetText = (event: Extract<GameEvent, { type: 'resource.accumulated' }>): string => {
  if (event.to.kind === 'actionSpace') return event.to.spaceId
  if (event.to.kind === 'card') return event.to.cardId
  return `round ${event.to.round}`
}

const actionLabel = (event: GameEvent): string =>
  'actionId' in event ? event.actionId : event.sourceActionId ?? ''

export const emptyPublicEventHighlightTargets = (): PublicEventHighlightTargets => ({
  actionIds: [],
  farmTiles: [],
  fenceEdges: [],
})

const actionIdFromLocation = (location: ResourceLocation | undefined): string | null =>
  location?.kind === 'actionSpace' ? location.spaceId : null

const farmTileFromLocation = (location: ResourceLocation | undefined): PublicEventFarmTileHighlightTarget | null =>
  location?.kind === 'field'
    ? { playerId: location.playerId, key: `${location.row}-${location.col}` }
    : null

const endpointFromLocation = (
  location: ResourceLocation | undefined,
): PublicEventResourceAnimationEndpoint | null => {
  if (!location) return null
  if (location.kind === 'supply') return { kind: 'supply' }
  if (location.kind === 'player') return { kind: 'playerResources', playerId: location.playerId }
  if (location.kind === 'actionSpace') return { kind: 'actionSpace', actionId: location.spaceId }
  if (location.kind === 'field') return { kind: 'farmTile', playerId: location.playerId, key: `${location.row}-${location.col}` }
  return null
}

const pushUnique = <T>(
  values: T[],
  seen: Set<string>,
  key: string,
  value: T,
) => {
  if (seen.has(key)) return
  seen.add(key)
  values.push(value)
}

const animationKey = (animation: PublicEventResourceAnimation): string =>
  `${animation.id}:${animation.kind}:${JSON.stringify(animation.from)}:${JSON.stringify(animation.to)}:${JSON.stringify(positiveResources(animation.resources))}`

const pushAnimation = (
  animations: PublicEventResourceAnimation[],
  seen: Set<string>,
  animation: PublicEventResourceAnimation,
) => {
  const resources = positiveResources(animation.resources)
  if (Object.keys(resources).length === 0) return
  const normalized = { ...animation, resources }
  pushUnique(animations, seen, animationKey(normalized), normalized)
}

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
  if (event.type === 'action.accumulated') {
    const resources = positiveResources(event.resources)
    if (Object.keys(resources).length === 0) return null
    return {
      id: event.id,
      kind: 'resource',
      message: locale === 'zh'
        ? `行动格积累：${event.spaceId} + ${resourceText(resources, locale)}`
        : `Action accumulated: ${event.spaceId} + ${resourceText(resources, locale)}`,
    }
  }
  if (event.type === 'resource.accumulated') {
    if (event.silent) return null
    const resources = positiveResources(event.resources)
    if (Object.keys(resources).length === 0) return null
    const target = accumulationTargetText(event)
    return {
      id: event.id,
      kind: 'resource',
      message: locale === 'zh'
        ? `资源积累：${target} + ${resourceText(resources, locale)}`
        : `Resource accumulated: ${target} + ${resourceText(resources, locale)}`,
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
  if (event.type === 'futureMeeple.removed') {
    return {
      id: event.id,
      kind: 'future',
      message: locale === 'zh' ? `移除未来工人：${event.cardId}` : `Future worker removed: ${event.cardId}`,
    }
  }
  if (event.type === 'futureMeeple.resolved') {
    return {
      id: event.id,
      kind: 'future',
      message: locale === 'zh' ? `未来工人执行：${event.cardId}` : `Future worker resolved: ${event.cardId}`,
    }
  }
  if (event.type === 'worker.promoted') {
    return {
      id: event.id,
      kind: 'action',
      message: locale === 'zh' ? `新生工人成年：${event.workerId}` : `Newborn worker promoted: ${event.workerId}`,
    }
  }
  if (event.type === 'card.infoboxChanged') {
    return {
      id: event.id,
      kind: 'card',
      message: locale === 'zh'
        ? `卡牌标记：${event.cardId}：${event.text}`
        : `Card note: ${event.cardId}: ${event.text}`,
    }
  }
  if (event.type === 'card.stackChanged') {
    const resources = positiveResources(event.resources ?? {})
    if (Object.keys(resources).length === 0) return null
    const sign = (typeof event.delta === 'number' && event.delta < 0) || event.reason === 'take' ? '-' : '+'
    return {
      id: event.id,
      kind: 'card',
      message: locale === 'zh'
        ? `卡牌资源：${event.cardId} ${sign} ${resourceText(resources, locale)}`
        : `Card resources: ${event.cardId} ${sign} ${resourceText(resources, locale)}`,
    }
  }
  if (event.type === 'card.swappedWithBoard') {
    return {
      id: event.id,
      kind: 'card',
      message: locale === 'zh'
        ? `卡牌交换：${event.fromPlayerCardId} -> ${event.toPlayerCardId}`
        : `Card swapped: ${event.fromPlayerCardId} -> ${event.toPlayerCardId}`,
    }
  }
  if (event.type === 'card.returnedToBoard') {
    return {
      id: event.id,
      kind: 'card',
      message: locale === 'zh' ? `卡牌归还：${event.cardId}` : `Card returned: ${event.cardId}`,
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

export const collectPublicEventHighlightTargets = (
  events: readonly GameEvent[],
): PublicEventHighlightTargets => {
  const highlights = emptyPublicEventHighlightTargets()
  const seenActions = new Set<string>()
  const seenFarmTiles = new Set<string>()
  const seenFenceEdges = new Set<string>()
  const pushAction = (actionId: string | null | undefined) => {
    if (!actionId) return
    pushUnique(highlights.actionIds, seenActions, actionId, actionId)
  }
  const pushFarmTile = (target: PublicEventFarmTileHighlightTarget | null | undefined) => {
    if (!target) return
    pushUnique(highlights.farmTiles, seenFarmTiles, `${target.playerId}:${target.key}`, target)
  }
  const pushFenceEdge = (playerId: string | undefined, edgeId: string) => {
    if (!playerId || !edgeId) return
    pushUnique(highlights.fenceEdges, seenFenceEdges, `${playerId}:${edgeId}`, { playerId, edgeId })
  }

  for (const event of events) {
    if (event.type === 'action.revealed') {
      pushAction(event.actionId)
      continue
    }
    if (event.type === 'action.exclusiveUseSet' || event.type === 'action.exclusiveUseCleared') {
      pushAction(event.actionId)
      pushAction(event.sourceActionId)
      continue
    }
    if (event.type === 'worker.placed') {
      pushAction(event.spaceId)
      pushAction(event.sourceActionId)
      continue
    }
    if (event.type === 'action.accumulated') {
      if (Object.keys(positiveResources(event.resources)).length === 0) continue
      pushAction(event.spaceId)
      continue
    }
    if (event.type === 'resource.accumulated') {
      if (Object.keys(positiveResources(event.resources)).length === 0) continue
      if (event.to.kind === 'actionSpace') pushAction(event.to.spaceId)
      continue
    }
    if (event.type === 'resource.moved') {
      pushAction(actionIdFromLocation(event.from))
      pushAction(actionIdFromLocation(event.to))
      continue
    }
    if (event.type === 'resource.exchanged') {
      pushAction(actionIdFromLocation(event.paidFrom))
      pushAction(actionIdFromLocation(event.paidTo))
      pushAction(actionIdFromLocation(event.gainedFrom))
      pushAction(actionIdFromLocation(event.gainedTo))
      continue
    }
    if (event.type === 'resource.paid') {
      pushAction(event.sourceActionId)
      pushAction(actionIdFromLocation(event.to))
      for (const source of event.paymentSources ?? []) {
        pushAction(actionIdFromLocation(source.from))
      }
      continue
    }
    if (event.type === 'farm.fieldPlowed') {
      for (const field of event.fields) {
        pushFarmTile({ playerId: field.playerId, key: `${field.row}-${field.col}` })
      }
      continue
    }
    if (event.type === 'farm.roomBuilt') {
      for (const room of event.rooms) {
        pushFarmTile({ playerId: room.playerId, key: `${room.row}-${room.col}` })
      }
      continue
    }
    if (event.type === 'farm.stableBuilt') {
      for (const stable of event.stables) {
        pushFarmTile({ playerId: stable.playerId, key: `${stable.row}-${stable.col}` })
      }
      continue
    }
    if (event.type === 'farm.renovated') {
      for (const room of event.rooms) {
        pushFarmTile({ playerId: event.playerId, key: `${room.row}-${room.col}` })
      }
      continue
    }
    if (event.type === 'farm.sown') {
      for (const sow of event.sows) {
        pushFarmTile(farmTileFromLocation(sow.location))
      }
      continue
    }
    if (event.type === 'farm.cropAdded' || event.type === 'farm.cropRemoved') {
      for (const crop of event.crops) {
        pushFarmTile(farmTileFromLocation(crop.location))
      }
      continue
    }
    if (event.type === 'farm.fenceBuilt') {
      const playerId = event.targetPlayerId ?? event.actorPlayerId
      for (const edgeId of event.newFenceEdges ?? []) {
        pushFenceEdge(playerId, edgeId)
      }
    }
  }

  return highlights
}

export const collectPublicEventResourceAnimations = (
  events: readonly GameEvent[],
): PublicEventResourceAnimation[] => {
  const animations: PublicEventResourceAnimation[] = []
  const seen = new Set<string>()
  for (const event of events) {
    if (event.type === 'resource.moved') {
      const from = endpointFromLocation(event.from)
      const to = endpointFromLocation(event.to)
      if (!from || !to) continue
      pushAnimation(animations, seen, {
        id: `${event.id}:move:0`,
        kind: 'move',
        resources: event.resources,
        from,
        to,
      })
      continue
    }
    if (event.type === 'resource.exchanged') {
      const paidFrom = endpointFromLocation(event.paidFrom)
      const paidTo = endpointFromLocation(event.paidTo)
      if (paidFrom && paidTo) {
        pushAnimation(animations, seen, {
          id: `${event.id}:exchange-paid:0`,
          kind: 'exchange',
          resources: event.paid,
          from: paidFrom,
          to: paidTo,
        })
      }
      const gainedFrom = endpointFromLocation(event.gainedFrom)
      const gainedTo = endpointFromLocation(event.gainedTo)
      if (gainedFrom && gainedTo) {
        pushAnimation(animations, seen, {
          id: `${event.id}:exchange-gained:0`,
          kind: 'exchange',
          resources: event.gained,
          from: gainedFrom,
          to: gainedTo,
        })
      }
      continue
    }
    if (event.type === 'resource.paid') {
      const to = endpointFromLocation(event.to) ?? { kind: 'supply' as const }
      const paymentSources = event.paymentSources ?? []
      if (paymentSources.length > 0) {
        paymentSources.forEach((source, index) => {
          const from = endpointFromLocation(source.from)
          if (!from) return
          pushAnimation(animations, seen, {
            id: `${event.id}:payment:${index}`,
            kind: 'payment',
            resources: source.resources,
            from,
            to,
          })
        })
        continue
      }
      if (!event.actorPlayerId) continue
      pushAnimation(animations, seen, {
        id: `${event.id}:payment:0`,
        kind: 'payment',
        resources: event.resources,
        from: { kind: 'playerResources', playerId: event.actorPlayerId },
        to,
      })
      continue
    }
    if (event.type === 'action.accumulated') {
      pushAnimation(animations, seen, {
        id: `${event.id}:accumulate:0`,
        kind: 'move',
        resources: event.resources,
        from: { kind: 'supply' },
        to: { kind: 'actionSpace', actionId: event.spaceId },
      })
      continue
    }
    if (event.type === 'resource.accumulated') {
      if (event.to.kind !== 'actionSpace') continue
      pushAnimation(animations, seen, {
        id: `${event.id}:accumulate:0`,
        kind: 'move',
        resources: event.resources,
        from: { kind: 'supply' },
        to: { kind: 'actionSpace', actionId: event.to.spaceId },
      })
    }
  }
  return animations
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

export const maxPublicEventSeq = (events?: readonly { seq: number }[]): number =>
  events?.reduce((max, event) => Math.max(max, event.seq), 0) ?? 0

export const collectNewPublicEventFeedback = (
  events: readonly GameEvent[],
  lastSeenSeq: number | null,
  locale: Locale,
  idPrefix = '',
): PublicEventFeedbackBatch => {
  const maxSeq = maxPublicEventSeq(events)
  if (lastSeenSeq === null || maxSeq < lastSeenSeq) {
    return { notifications: [], highlights: emptyPublicEventHighlightTargets(), resourceAnimations: [], nextCursor: maxSeq }
  }
  const nextEvents = events.filter((event) => event.seq > lastSeenSeq)
  return {
    notifications: collectPublicEventNotifications(nextEvents, locale, idPrefix),
    highlights: collectPublicEventHighlightTargets(nextEvents),
    resourceAnimations: collectPublicEventResourceAnimations(nextEvents),
    nextCursor: maxSeq,
  }
}

export const collectNewPublicEventNotifications = (
  events: readonly GameEvent[],
  lastSeenSeq: number | null,
  locale: Locale,
  idPrefix = '',
): PublicEventNotificationBatch => {
  const { notifications, nextCursor } = collectNewPublicEventFeedback(events, lastSeenSeq, locale, idPrefix)
  return { notifications, nextCursor }
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
