import type { ActionDefinition } from '../../game/types'
import { setCardFlag } from '../../cards/helpers/card-state'

export const unflagCardAction: ActionDefinition = {
  id: 'unflag-card',
  nameKey: 'actions.unflag-card.name',
  descriptionKey: 'actions.unflag-card.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, sourceCard }) => {
    if (!sourceCard) {
      return { type: 'fail', logKey: 'log.exchangeFail' }
    }
    setCardFlag(player, sourceCard, false)
    return { type: 'ok' }
  },
}
