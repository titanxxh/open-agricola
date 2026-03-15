import type { ActionDefinition } from '../../game/types'
import { setCardFlag } from '../../cards/helpers/card-state'

export const flagCardAction: ActionDefinition = {
  id: 'flag-card',
  nameKey: 'actions.flag-card.name',
  descriptionKey: 'actions.flag-card.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, sourceCard }) => {
    if (!sourceCard) {
      return { type: 'fail', logKey: 'log.exchangeFail' }
    }
    setCardFlag(player, sourceCard, true)
    return { type: 'ok' }
  },
}
