import type { ActionDefinition, Resource } from '../../../contract/types'
import { popFromCardStack } from '../../../cards/helpers/card-state'
import { addCardResourceGained } from '../../../cards/helpers/card-state'
import { gainResources } from '../gain'
import { trackWorkPhaseBuildingResources } from '../../../session/work-phase-resources'
import { addResourcesFromCards } from '../../../session/stats'

export const popCardStackAction: ActionDefinition = {
  id: 'pop-card-stack',
  nameKey: 'actions.pop-card-stack.name',
  descriptionKey: 'actions.pop-card-stack.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, sourceCard }) => {
    if (!sourceCard) {
      return { type: 'fail', logKey: 'log.actionFail' }
    }
    const resource = popFromCardStack(player, sourceCard)
    if (!resource) {
      return { type: 'ok' }
    }
    const gain: Partial<Resource> = { [resource]: 1 }
    gainResources(player, gain)
    trackWorkPhaseBuildingResources(state, player.id, gain)
    addCardResourceGained(player, sourceCard, gain)
    addResourcesFromCards(player, gain)
    return {
      type: 'ok',
      resourcesGained: gain,
      logKey: 'log.cardEffectGain',
      logParams: { gain, cardId: sourceCard },
    }
  },
}
