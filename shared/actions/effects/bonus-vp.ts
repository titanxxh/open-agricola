import type { ActionDefinition } from '../../game/types'
import { incCounter } from '../../cards/__stubs__/helpers'

export const bonusVpAction: ActionDefinition = {
  id: 'bonus-vp',
  nameKey: 'actions.bonus-vp.name',
  descriptionKey: 'actions.bonus-vp.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, sourceCard }) => {
    if (!sourceCard) {
      return { type: 'fail', logKey: 'log.exchangeFail' }
    }
    incCounter(player, sourceCard, 'bonusVp')
    return { type: 'ok' }
  },
}
