import { moorSpecialActionBaseResources } from '../domain/moor-special-action-values'
import type { MoorSpecialActionId } from '../moor/types'

const MOOR_SPECIAL_ACTION_IDS = new Set<string>([
  'cut-peat',
  'fell-trees',
  'slash-and-burn',
  'horse-market',
  'hiring-fair',
  'black-market',
  'illicit-work',
])

export const isMoorSpecialActionId = (value: string): value is MoorSpecialActionId =>
  MOOR_SPECIAL_ACTION_IDS.has(value)

export const isMoorTerrainAction = (actionId: MoorSpecialActionId): boolean =>
  actionId === 'cut-peat' || actionId === 'fell-trees' || actionId === 'slash-and-burn'

/** Parameters of `moor.specialActions.effects.<actionId>` for the printed values at a player count. */
export const moorSpecialActionEffectParams = (actionId: MoorSpecialActionId, playerCount: number) => {
  const { cost, gain } = moorSpecialActionBaseResources(actionId, playerCount)
  return { ...gain, foodCost: cost.food ?? 0, fuelCost: cost.fuel ?? 0 }
}

export const moorSpecialActionBuysImprovement = (actionId: MoorSpecialActionId): boolean =>
  actionId === 'black-market' || actionId === 'illicit-work'
