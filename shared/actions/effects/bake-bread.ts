import type { ActionExecutionResult, PlayerState } from '../../game/types'

const bakeTable = {
  Major_Fireplace1: 2,
  Major_Fireplace2: 2,
  Major_CookingHearth1: 3,
  Major_CookingHearth2: 3,
  Major_ClayOven: 5,
  Major_StoneOven: 4,
} as const

export type BakeImprovementId = keyof typeof bakeTable

export const canBakeBread = (player: PlayerState, improvement: BakeImprovementId) =>
  player.resources.grain > 0 && player.improvements.includes(improvement)

export const bakeBread = (
  player: PlayerState,
  improvement: BakeImprovementId,
  times = 1,
): ActionExecutionResult => {
  if (!canBakeBread(player, improvement)) {
    return { type: 'ok' }
  }
  const bakeTimes = Math.max(0, Math.min(player.resources.grain, times))
  if (bakeTimes === 0) {
    return { type: 'ok' }
  }
  const foodGained = bakeTable[improvement] * bakeTimes
  player.resources.grain -= bakeTimes
  player.resources.food += foodGained
  return {
    type: 'ok',
    logKey: 'log.bakeBreadResult',
    params: {
      grainUsed: bakeTimes,
      foodGained,
      improvement,
    },
  }

}