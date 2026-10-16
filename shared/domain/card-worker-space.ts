import { emptyResources } from '../contract/state-constants'
import type { ActionSpace, WorkerRef } from '../contract/types'
import { normalizeTakenBy } from './space'

const CARD_WORKER_PREFIX = 'card-worker:'

export const createCardWorkerSpace = (sourceCard: string, takenBy: WorkerRef[] = []): ActionSpace => ({
  id: `${CARD_WORKER_PREFIX}${sourceCard}`,
  nameKey: `cards.${sourceCard}.name`,
  descriptionKey: `cards.${sourceCard}.description`,
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => false,
  execute: () => ({ type: 'fail', errorKey: 'log.placeFarmerFail' }),
  resources: { ...emptyResources },
  takenBy,
})

export const restoreCardWorkerSpaces = (
  spaces: readonly Pick<ActionSpace, 'id' | 'takenBy'>[],
): ActionSpace[] => spaces.flatMap(space => {
  if (!space.id.startsWith(CARD_WORKER_PREFIX)) return []
  const sourceCard = space.id.slice(CARD_WORKER_PREFIX.length)
  return sourceCard ? [createCardWorkerSpace(sourceCard, normalizeTakenBy(space.takenBy))] : []
})
