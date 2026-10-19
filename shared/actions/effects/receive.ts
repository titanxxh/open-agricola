import type { ActionDefinition, FarmOperationResult, FutureMeepleResourceMap, GameState, PlayerState, Resource } from '../../contract/types'
import type { EventSink } from '../../contract/events'
import { addCardResourceGained } from '../../cards/helpers/card-state'
import { addResourcesFromCards } from '../../session/stats'
import { trackWorkPhaseBuildingResources } from '../../session/work-phase-resources'
import { extendedResourceKeyList } from '../../contract/state-constants'
import { commitFirstAvailableRoom } from '../../domain/farm-operations'

type FutureReceiveEntry = {
  cardId: string
  round: number
  resources: FutureMeepleResourceMap
}

const canReceiveScheduledEntry = (player: PlayerState, condition: unknown): boolean => {
  if (!condition || typeof condition !== 'object' || !('kind' in condition) || condition.kind !== 'min-resource') return true
  if (!('resource' in condition) || !('amount' in condition) || typeof condition.amount !== 'number') return false
  const resource = extendedResourceKeyList.find(key => key === condition.resource)
  return resource !== undefined && (player.resources[resource] ?? 0) >= condition.amount
}

const positiveResources = (resources: Partial<Resource>): Partial<Resource> => {
  const out: Partial<Resource> = {}
  for (const key of extendedResourceKeyList) {
    const amount = resources[key] ?? 0
    if (amount > 0) out[key] = amount
  }
  return out
}

const addResources = (player: PlayerState, resources: Partial<Resource>) => {
  for (const key of extendedResourceKeyList) {
    const amount = resources[key] ?? 0
    if (amount > 0) player.resources[key] = (player.resources[key] ?? 0) + amount
  }
}

const emitReceivedResources = (
  eventSink: EventSink | undefined,
  player: PlayerState,
  entry: FutureReceiveEntry,
  resources: Partial<Resource>,
) => {
  if (Object.keys(resources).length === 0) return
  eventSink?.emit<'resource.moved'>({
    type: 'resource.moved',
    resources,
    from: { kind: 'roundCard', round: entry.round },
    to: { kind: 'player', playerId: player.id },
    reason: 'receive',
    sourceCardId: entry.cardId,
  })
}

/**
 * Credits goods that a source action already removed from the leaf's source card
 * (counters, stack items or farm goods tokens), so every arrival of existing goods
 * reaches Receive listeners through this one leaf.
 */
const receiveCardGoods = (
  state: GameState,
  player: PlayerState,
  sourceCard: string,
  resources: Partial<Resource>,
  eventSink: EventSink | undefined,
) => {
  addResources(player, resources)
  trackWorkPhaseBuildingResources(state, player.id, resources)
  addResourcesFromCards(player, resources)
  addCardResourceGained(player, sourceCard, resources)
  eventSink?.emit<'resource.moved'>({
    type: 'resource.moved',
    resources,
    from: { kind: 'card', playerId: player.id, cardId: sourceCard },
    to: { kind: 'player', playerId: player.id },
    reason: 'cardEffect',
    sourceCardId: sourceCard,
  })
}

export const receiveFromCardLeaf = (sourceCard: string, resources: Partial<Resource>) => ({
  type: 'leaf' as const,
  actionId: 'receive',
  sourceCard,
  params: { fromCard: resources },
})

export const completeScheduledReceipts = (state: GameState, player: PlayerState, ids: unknown, eventSink: EventSink): void => {
  const selected = Array.isArray(ids) ? new Set(ids.filter((id): id is string => typeof id === 'string')) : new Set<string>()
  const due = state.futureMeeples.filter(entry => selected.has(entry.id) && entry.playerId === player.id && entry.round === state.round)
  for (const entry of due) eventSink.emit<'futureMeeple.resolved'>({
    type: 'futureMeeple.resolved', playerId: player.id, cardId: entry.cardId, sourceCardId: entry.cardId,
  })
  const completed = new Set(due.map(entry => entry.id))
  state.futureMeeples = state.futureMeeples.filter(entry => !completed.has(entry.id))
}

export const receiveAction: ActionDefinition = {
  id: 'receive',
  nameKey: 'actions.receive.name',
  descriptionKey: 'actions.receive.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (state, player, context) => state.futureMeeples.filter(entry => Array.isArray(context?.params?.futureMeepleIds)
      && context.params.futureMeepleIds.includes(entry.id) && entry.playerId === player.id && entry.round === state.round)
      .every(entry => canReceiveScheduledEntry(player, entry.actionContext?.resourceCondition)),
  execute: ({ state, player, params, sourceCard, eventSink }) => {
    const fromCard = params?.fromCard
    if (fromCard !== undefined) {
      if (!sourceCard || !fromCard || typeof fromCard !== 'object') return { type: 'fail', errorKey: 'log.actionFail' }
      const resources = positiveResources(fromCard as Partial<Resource>)
      if (Object.keys(resources).length > 0) receiveCardGoods(state, player, sourceCard, resources, eventSink)
      return { type: 'ok', resourcesGained: resources }
    }
    const scheduledIds = Array.isArray(params?.futureMeepleIds)
      ? new Set(params.futureMeepleIds.filter((id): id is string => typeof id === 'string')) : new Set<string>()
    const scheduled = state.futureMeeples.filter(entry => scheduledIds.has(entry.id)
      && entry.playerId === player.id && entry.round === state.round)
    const farmOperations: FarmOperationResult[] = []
    const scheduledEntries = scheduled.map(entry => {
      const conditionMet = canReceiveScheduledEntry(player, entry.actionContext?.resourceCondition)
      const resources = conditionMet ? positiveResources(entry.resources) : {}
      if (entry.roomType && player.houseType === entry.roomType) {
        const roomType = entry.roomType
        const farmOperation = commitFirstAvailableRoom(player, entry.cardId, eventSink)
        if (farmOperation) {
          farmOperations.push(farmOperation)
          eventSink?.emit<'farm.roomBuilt'>({
            type: 'farm.roomBuilt', sourceCardId: entry.cardId, targetPlayerId: player.id,
            rooms: farmOperation.positions.map(tile => ({ playerId: player.id, ...tile, type: roomType })),
            newlyUsedTiles: farmOperation.newlyUsedTiles,
          })
        }
      }
      eventSink?.emit<'futureMeeple.resolved'>({
        type: 'futureMeeple.resolved', playerId: player.id, cardId: entry.cardId,
        sourceCardId: entry.cardId,
        ...(Object.keys(resources).length ? { resources } : {}),
        ...(entry.roomType ? { roomType: entry.roomType } : {}),
      })
      return { cardId: entry.cardId, round: entry.round, resources }
    })
    state.futureMeeples = state.futureMeeples.filter(entry => !scheduled.some(resolved => resolved.id === entry.id))
    const explicitEntries = Array.isArray((params as { entries?: unknown } | undefined)?.entries)
      ? (params as { entries: FutureReceiveEntry[] }).entries
      : []
    const entries = [...scheduledEntries, ...explicitEntries]
    const gained: Partial<Resource> = {}
    for (const entry of entries) {
      const resources = positiveResources(entry.resources)
      if (Object.keys(resources).length === 0) continue
      addResources(player, resources)
      addResourcesFromCards(player, resources)
      addCardResourceGained(player, entry.cardId, resources)
      emitReceivedResources(eventSink, player, entry, resources)
      for (const key of extendedResourceKeyList) {
        const amount = resources[key] ?? 0
        if (amount > 0) gained[key] = (gained[key] ?? 0) + amount
      }
    }
    return { type: 'ok', resourcesGained: gained, ...(farmOperations.length ? { farmOperations } : {}) }
  },
}
