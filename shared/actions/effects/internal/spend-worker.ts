import type { ActionDefinition, ActionSpace, GameState } from '../../../contract/types'
import { recordRoundPlacement } from '../../../cards/helpers/round-placement'
import { smallestAvailableWorker, workersAvailable } from '../../../domain/player'
import { addWorkerRef, findActionSpaceById } from '../../../domain/space'
import { createCardWorkerSpace } from '../../../domain/card-worker-space'

const ensureCardPseudoSpace = (state: GameState, cardId: string): ActionSpace => {
  const spaceId = `card-worker:${cardId}`
  const existing = findActionSpaceById(state, spaceId)
  if (existing) return existing
  const space = createCardWorkerSpace(cardId)
  state.actionSpaces.push(space)
  return space
}

export const spendWorkerAction: ActionDefinition = {
  id: 'spend-worker',
  nameKey: 'actions.spend-worker.name',
  descriptionKey: 'actions.spend-worker.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (state, player) => workersAvailable(state, player) > 0,
  execute: ({ state, player, sourceCard, actionContext }) => {
    const worker = smallestAvailableWorker(state, player)
    if (!worker) {
      return { type: 'fail', errorKey: 'log.placeFarmerFail' }
    }

    const roundPlacementId =
      typeof actionContext?.roundPlacementId === 'string'
        ? actionContext.roundPlacementId
        : sourceCard
          ? `card:${sourceCard}`
          : undefined

    if (sourceCard) {
      const space = ensureCardPseudoSpace(state, sourceCard)
      addWorkerRef(space, player.id, worker.id)
    }

    if (roundPlacementId) {
      recordRoundPlacement(player, roundPlacementId, worker.id)
    }
    return { type: 'ok' }
  },
}
