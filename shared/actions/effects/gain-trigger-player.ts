import type { ActionDefinition, Resource } from '../../game/types'
import { gainResources } from './gain'
import { addResourcesFromCards } from '../../logic/stats'

export const gainTriggerPlayerAction: ActionDefinition = {
  id: 'gain-trigger-player',
  nameKey: 'actions.gain-trigger-player.name',
  descriptionKey: 'actions.gain-trigger-player.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, params, sourceCard }) => {
    const { targetPlayerId, ...resourceGains } = (params ?? {}) as { targetPlayerId: string } & Partial<Resource>
    const target = state.players.find((p) => p.id === targetPlayerId)
    if (!target) {
      return { type: 'ok' }
    }
    gainResources(target, resourceGains)
    if (sourceCard) {
      addResourcesFromCards(target, resourceGains)
    }
    return { type: 'ok' }
  },
}
