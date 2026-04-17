import type { ActionDefinition, FenceSegment, PlayerState } from '../../game/types'
import { canAffordTypedFlatCost } from './pay-helpers'

export const maxFences = 15
export const maxPastureCells = 15
export const stableWoodCost = 2
export const minimumFenceSegments = 4

export const getFenceCount = <T extends { fenceSegments: FenceSegment[] }>(
  p: T,
): number => p.fenceSegments.reduce((n, s) => n + (s.type === 'fence' ? 1 : 0), 0)

export const getPalisadeCount = <T extends { fenceSegments: FenceSegment[] }>(
  p: T,
): number => p.fenceSegments.reduce((n, s) => n + (s.type === 'palisade' ? 1 : 0), 0)

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
  if (getFenceCount(player) + minimumFenceSegments > maxFences) return false
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
  if (getFenceCount(player) + fenceCost > maxFences) return false
  if (totalCells + size > maxPastureCells) return false
  return canAffordTypedFlatCost(player, { wood: woodCost }, 'fencing')
}

export const fenceAction: ActionDefinition = {
  id: 'fence',
  nameKey: 'actions.fencing.name',
  descriptionKey: 'actions.fencing.description',
  roundAvailable: 1,
  gainPerRound: {},
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
