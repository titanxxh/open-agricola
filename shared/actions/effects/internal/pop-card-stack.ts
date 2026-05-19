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
  execute: ({ state, player, sourceCard, eventSink }) => {
    if (!sourceCard) {
      return { type: 'fail', errorKey: 'log.actionFail' }
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
    eventSink?.emit<'card.stackChanged'>({
      type: 'card.stackChanged',
      cardId: sourceCard,
      targetPlayerId: player.id,
      resources: gain,
      delta: -1,
      reason: 'take',
    })
    eventSink?.emit<'resource.moved'>({
      type: 'resource.moved',
      resources: gain,
      from: { kind: 'card', playerId: player.id, cardId: sourceCard },
      to: { kind: 'player', playerId: player.id },
      reason: 'cardEffect',
      sourceCardId: sourceCard,
    })
    return { type: 'ok', resourcesGained: gain }
  },
}
