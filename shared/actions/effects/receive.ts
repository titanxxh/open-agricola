import type { ActionDefinition, FutureMeepleResourceMap, PlayerState, Resource } from '../../contract/types'
import type { EventSink } from '../../contract/events'
import { addCardResourceGained } from '../../cards/helpers/card-state'
import { addResourcesFromCards } from '../../session/stats'
import { resourceKeyList } from '../../contract/state-constants'

type FutureReceiveEntry = {
  cardId: string
  round: number
  resources: FutureMeepleResourceMap
}

const positiveResources = (resources: Partial<Resource>): Partial<Resource> => {
  const out: Partial<Resource> = {}
  for (const key of resourceKeyList) {
    const amount = resources[key] ?? 0
    if (amount > 0) out[key] = amount
  }
  return out
}

const addResources = (player: PlayerState, resources: Partial<Resource>) => {
  for (const key of resourceKeyList) {
    const amount = resources[key] ?? 0
    if (amount > 0) player.resources[key] += amount
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

export const receiveAction: ActionDefinition = {
  id: 'receive',
  nameKey: 'actions.receive.name',
  descriptionKey: 'actions.receive.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, params, eventSink }) => {
    const entries = Array.isArray((params as { entries?: unknown } | undefined)?.entries)
      ? (params as { entries: FutureReceiveEntry[] }).entries
      : []
    const gained: Partial<Resource> = {}
    for (const entry of entries) {
      const resources = positiveResources(entry.resources)
      if (Object.keys(resources).length === 0) continue
      addResources(player, resources)
      addResourcesFromCards(player, resources)
      addCardResourceGained(player, entry.cardId, resources)
      emitReceivedResources(eventSink, player, entry, resources)
      for (const key of resourceKeyList) {
        const amount = resources[key] ?? 0
        if (amount > 0) gained[key] = (gained[key] ?? 0) + amount
      }
    }
    return { type: 'ok', resourcesGained: gained }
  },
}
