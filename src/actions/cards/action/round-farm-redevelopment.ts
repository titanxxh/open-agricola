import { applyCostOverride, canPayResources } from '../../effects/pay'
import { getRenovation, renovateHouse } from '../../effects/house'
import type { ActionDefinition } from '../../../game/types'

export const farmRedevelopment: ActionDefinition = {
  id: 'farm-redevelopment',
  nameKey: 'actions.farm-redevelopment.name',
  descriptionKey: 'actions.farm-redevelopment.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_, player) => {
    const renovation = getRenovation(player)
    if (!renovation) return false
    return canPayResources(player, renovation.cost)
  },
  execute: ({ player, costs }) => {
    const renovation = getRenovation(player)
    if (!renovation) {
      return { type: 'fail', logKey: 'log.renovationFail' }
    }
    const renovationCost = applyCostOverride(renovation.cost, costs)
    if (!canPayResources(player, renovationCost)) {
      return { type: 'fail', logKey: 'log.renovationFail' }
    }
    const result = renovateHouse(player, costs)
      ? { type: 'ok' as const }
      : { type: 'fail' as const, logKey: 'log.renovationFail' }
    if (result.type === 'fail') {
      return result
    }
    if (player.resources.wood <= 0) {
      return result
    }
    return {
      type: 'choice',
      promptKey: 'ui.interactionFenceSelect',
      options: [
        { value: 'confirm', labelKey: 'ui.interactionFenceConfirm' },
        { value: 'cancel', labelKey: 'ui.interactionFenceCancel' },
      ],
    }
  },
}
