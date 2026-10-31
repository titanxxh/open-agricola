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

/** Player counts of a card that print the same effect, in the order the card lists them. */
export const moorSpecialActionEffectGroups = (actionId: MoorSpecialActionId, playerCounts: readonly number[]) => {
  const groups = new Map<string, { playerCounts: number[]; params: ReturnType<typeof moorSpecialActionEffectParams> }>()
  for (const count of playerCounts) {
    const params = moorSpecialActionEffectParams(actionId, count)
    const signature = JSON.stringify(params)
    const group = groups.get(signature) ?? { playerCounts: [], params }
    group.playerCounts.push(count)
    groups.set(signature, group)
  }
  return [...groups.values()]
}

export const moorSpecialActionBuysImprovement = (actionId: MoorSpecialActionId): boolean =>
  actionId === 'black-market' || actionId === 'illicit-work'
