import type { ActionDefinition, FenceSegment, GameState, PlayerState, Resource } from '../../game/types'
import { canAffordTypedFlatCost } from '../helpers/pay-helpers'

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

export const getTotalPastureCells = (player: PlayerState) =>
  player.pastures.reduce((sum, pasture) => sum + pasture.size, 0)

export const canStartFencing = (
  _state: GameState,
  player: PlayerState,
  costOverride?: Partial<Resource>,
) => {
  if (getFenceCount(player) + minimumFenceSegments > maxFences) return false
  if (getTotalPastureCells(player) >= maxPastureCells) return false
  const free = Math.max(0, Math.abs(costOverride?.wood ?? 0))
  if (free > 0) {
    const woodCount = player.resources.wood ?? 0
    if (woodCount + free >= minimumFenceSegments) return true
  }
  return canAffordTypedFlatCost(player, { wood: minimumFenceSegments }, 'fencing')
}

export const fenceAction: ActionDefinition = {
  id: 'fence',
  nameKey: 'actions.fencing.name',
  descriptionKey: 'actions.fencing.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (state, player) => canStartFencing(state, player),
  costPreview: {
    getBaseCost: () => ({ wood: minimumFenceSegments }),
    canExecute: (ctx, costOverride) =>
      canStartFencing(ctx.state, ctx.player, costOverride),
  },
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
