import type { ActionDefinition, FenceSegment, GameState, PlayerState } from '../../game/types'
import { canAffordTypedFlatCost } from '../helpers/pay-helpers'
import { getCardEffect } from '../../cards/card-effects'

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

/**
 * Sum of "free fences this player can build right now" contributed by any card
 * that implements `computeFenceFreeAvailable` (e.g. E16 returns count of
 * unused border edges). Mirrors BGA `getMaxBuildableFences` summing path.
 */
const computeFreeFencesAvailable = (state: GameState, player: PlayerState): number => {
  let total = 0
  for (const cardId of [...player.improvements, ...player.minorPlayed]) {
    const effect = getCardEffect(cardId)
    if (!effect?.computeFenceFreeAvailable) continue
    try {
      total += effect.computeFenceFreeAvailable(state, player) ?? 0
    } catch (err) {
      if (cardId.startsWith('CUSTOM_')) {
        console.warn(`[fencing] custom card ${cardId} computeFenceFreeAvailable threw, skipping:`, err)
        continue
      }
      throw err
    }
  }
  return total
}

export const canStartFencing = (state: GameState, player: PlayerState) => {
  if (getFenceCount(player) + minimumFenceSegments > maxFences) return false
  if (getTotalPastureCells(player) >= maxPastureCells) return false
  // BGA-style: total max buildable = wood-affordable + sum(free fences).
  // We can't perfectly preview the modifier-aware wood/fence ratio without
  // running the solver, but the simple "(wood / 1) + freeFromCards >= 4"
  // approximation matches BGA `getMaxBuildableFences` and unblocks E16-only
  // entry. Cards that strictly require wood-payment (no free fences) keep the
  // typed-flat-cost path via `canAffordTypedFlatCost` for accuracy.
  const free = computeFreeFencesAvailable(state, player)
  if (free > 0) {
    const woodCount = player.resources.wood ?? 0
    if (woodCount + free >= minimumFenceSegments) return true
  }
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
  canBeExecutedByPlayer: (state, player) => canStartFencing(state, player),
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
