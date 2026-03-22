import type { ActionDefinition, Resource } from '../../game/types'
import { gainResources } from './gain'

export const gainOtherPlayersAction: ActionDefinition = {
  id: 'gain-other-players',
  nameKey: 'actions.gain-other-players.name',
  descriptionKey: 'actions.gain-other-players.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, params }) => {
    const gain = (params ?? {}) as Partial<Resource>
    state.players
      .filter((entry) => entry.id !== player.id)
      .forEach((entry) => gainResources(entry, gain))
    return { type: 'ok' }
  },
}
