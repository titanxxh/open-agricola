import type { ActionDefinition, Resource } from '../../game/types'
import { addCardResourceGained } from '../../cards/helpers/card-state'
import { gainResources } from './gain'
import {
  addResourcesFromBoard,
  addResourcesFromCards,
} from '../../logic/stats'

export const gainOtherPlayersAction: ActionDefinition = {
  id: 'gain-other-players',
  nameKey: 'actions.gain-other-players.name',
  descriptionKey: 'actions.gain-other-players.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, params, sourceCard }) => {
    const gain = (params ?? {}) as Partial<Resource>
    const recipients = state.players.filter((entry) => entry.id !== player.id)
    recipients.forEach((entry) => {
      gainResources(entry, gain)
      if (sourceCard) {
        addResourcesFromCards(entry, gain)
      } else {
        addResourcesFromBoard(entry, gain)
      }
    })
    if (sourceCard && recipients.length > 0) {
      const totalGain = Object.fromEntries(
        Object.entries(gain).map(([key, value]) => [key, (typeof value === 'number' ? value : 0) * recipients.length]),
      ) as Partial<Resource>
      addCardResourceGained(player, sourceCard, totalGain)
    }
    if (sourceCard && recipients.length > 0) {
      return {
        type: 'ok',
        logKey: 'log.cardEffectOtherPlayersGain',
        logParams: { gain, cardId: sourceCard },
      }
    }
    return { type: 'ok' }
  },
}
