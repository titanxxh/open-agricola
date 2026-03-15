import type { ActionDefinition } from '../../game/types'
import { storePendingFenceBonus } from '../../cards/helpers/pending-fence-bonus'

export const reserveFenceBonusAction: ActionDefinition = {
  id: 'reserve-fence-bonus',
  nameKey: 'actions.reserve-fence-bonus.name',
  descriptionKey: 'actions.reserve-fence-bonus.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, params, sourceCard }) => {
    if (!sourceCard || typeof params?.freeFences !== 'number' || params.freeFences <= 0) {
      return { type: 'fail', logKey: 'log.exchangeFail' }
    }
    storePendingFenceBonus(player, {
      sourceCard,
      counterKey: typeof params.counterKey === 'string' ? params.counterKey : 'fences',
      freeFences: params.freeFences,
      incrementTriggerCount: params.incrementTriggerCount === true,
    })
    return { type: 'ok' }
  },
}
