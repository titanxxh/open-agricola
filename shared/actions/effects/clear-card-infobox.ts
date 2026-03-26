import type { ActionDefinition } from '../../game/types'
import { clearCardInfobox } from '../../cards/helpers/card-state'

export const clearCardInfoboxAction: ActionDefinition = {
  id: 'clear-card-infobox',
  nameKey: 'actions.clear-card-infobox.name',
  descriptionKey: 'actions.clear-card-infobox.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, sourceCard }) => {
    if (!sourceCard) {
      return { type: 'fail', logKey: 'log.exchangeFail' }
    }
    clearCardInfobox(player, sourceCard)
    return { type: 'ok' }
  },
}
