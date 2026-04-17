import type { ActionDefinition } from '../../game/types'
import { recordRoundPlacement } from '../../cards/helpers/round-placement'

export const spendWorkerAction: ActionDefinition = {
  id: 'spend-worker',
  nameKey: 'actions.spend-worker.name',
  descriptionKey: 'actions.spend-worker.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_, player) => player.workersAvailable > 0,
  execute: ({ player, sourceCard, actionContext }) => {
    if (player.workersAvailable <= 0) {
      return { type: 'fail', logKey: 'log.placeFarmerFail' }
    }

    player.workersAvailable -= 1
    const roundPlacementId =
      typeof actionContext?.roundPlacementId === 'string'
        ? actionContext.roundPlacementId
        : sourceCard
          ? `card:${sourceCard}`
          : undefined
    if (roundPlacementId) {
      recordRoundPlacement(player, roundPlacementId, '?')
    }
    return { type: 'ok' }
  },
}
