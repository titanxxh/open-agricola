import type { ActionDefinition, ActionSpace, GameState } from '../../../contract/types'
import { recordRoundPlacement } from '../../../cards/helpers/round-placement'
import { smallestAvailableWorker, workersAvailable } from '../../../game/player'
import { addWorkerRef } from '../../../game/space'

const emptyResources = () => ({
  wood: 0,
  clay: 0,
  reed: 0,
  stone: 0,
  food: 0,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  begging: 0,
})

const ensureCardPseudoSpace = (state: GameState, cardId: string): ActionSpace => {
  const spaceId = `card-worker:${cardId}`
  const existing = state.actionSpaces.find((s) => s.id === spaceId)
  if (existing) return existing
  const space: ActionSpace = {
    id: spaceId,
    nameKey: `cards.${cardId}.name`,
    descriptionKey: `cards.${cardId}.description`,
    roundAvailable: 1,
    gainPerRound: {},
    canBeExecutedByPlayer: () => false,
    execute: () => ({ type: 'ok' }),
    resources: emptyResources(),
    takenBy: [],
  }
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
      return { type: 'fail', logKey: 'log.placeFarmerFail' }
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
