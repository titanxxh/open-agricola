import type {
  ActionCostPreview,
  ActionDefinition,
  ActionExecutionResult,
  Pasture,
  PlayerState,
} from '../../game/types'
import { canAffordTypedFlatCost, payTypedFlatCost } from './pay-helpers'

export const maxFences = 15
export const maxPastureCells = 15
export const stableWoodCost = 2
export const minimumFenceSegments = 4

const pastureLayouts = [
  { size: 1, fences: 4 },
  { size: 2, fences: 6 },
  { size: 3, fences: 8 },
  { size: 4, fences: 8 },
  { size: 5, fences: 12 },
  { size: 6, fences: 10 },
  { size: 8, fences: 12 },
  { size: 9, fences: 12 },
  { size: 10, fences: 14 },
  { size: 12, fences: 14 },
  { size: 15, fences: 16 },
]

export const getPastureLayouts = () => pastureLayouts

export const getTotalPastureCells = (player: PlayerState) =>
  player.pastures.reduce((sum, pasture) => sum + pasture.size, 0)

export const getPastureWoodCost = (stables: number, fenceCost: number) =>
  fenceCost + stables * stableWoodCost

export const canStartFencing = (player: PlayerState) => {
  if (player.fences + minimumFenceSegments > maxFences) return false
  if (getTotalPastureCells(player) >= maxPastureCells) return false
  return canAffordTypedFlatCost(player, { wood: minimumFenceSegments }, 'fencing')
}

export const canBuildPasture = (
  player: PlayerState,
  size: number,
  stables: number,
  fenceCost: number,
) => {
  const totalCells = getTotalPastureCells(player)
  const woodCost = getPastureWoodCost(stables, fenceCost)
  if (player.fences + fenceCost > maxFences) return false
  if (totalCells + size > maxPastureCells) return false
  return canAffordTypedFlatCost(player, { wood: woodCost }, 'fencing')
}

export const buildPasture = (
  player: PlayerState,
  params: { size: number; stables: number; fenceCost: number },
): ActionExecutionResult => {
  const { size, stables, fenceCost } = params
  if (!Number.isFinite(size) || size <= 0) {
    return { type: 'fail', logKey: 'log.fencingFail' }
  }
  if (!canBuildPasture(player, size, stables, fenceCost)) {
    return { type: 'fail', logKey: 'log.fencingFail' }
  }
  const woodCost = getPastureWoodCost(stables, fenceCost)
  if (!payTypedFlatCost(player, { wood: woodCost }, 'fencing')) {
    return { type: 'fail', logKey: 'log.fencingFail' }
  }
  player.fences += fenceCost
  const pasture: Pasture = {
    id: `pasture-${player.pastures.length + 1}`,
    size,
    tiles: [],
    stables,
    animalType: null,
    animalCount: 0,
  }
  player.pastures.push(pasture)
  return { type: 'ok' }
}

export const fenceAction: ActionDefinition = {
  id: 'fence',
  nameKey: 'actions.fencing.name',
  descriptionKey: 'actions.fencing.description',
  roundAvailable: 1,
  gainPerRound: {},
  costPreview: {
    isStructurallyPossible: ({ player }) =>
      player.fences + minimumFenceSegments <= maxFences &&
      getTotalPastureCells(player) < maxPastureCells,
    getBaseCost: () => ({ wood: minimumFenceSegments }),
  } satisfies ActionCostPreview,
  canBeExecutedByPlayer: (_, player) => canStartFencing(player),
  execute: () => ({
    type: 'choice',
    promptKey: 'ui.interactionFenceSelect',
    options: [
      { value: 'confirm', labelKey: 'ui.interactionFenceConfirm' },
      { value: 'cancel', labelKey: 'ui.interactionFenceCancel' },
    ],
  }),
  resolveChoice: () => ({ type: 'ok' }),
}
