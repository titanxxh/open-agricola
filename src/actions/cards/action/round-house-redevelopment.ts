import { applyCostOverride, canPayResources } from '../../effects/pay'
import { getRenovation, renovateHouse } from '../../effects/house'
import type {
  ActionChoiceOption,
  ActionDefinition,
  PlayerState,
} from '../../../game/types'
import { getMinorImprovement } from '../../../game/minor-improvements'
import { majorCardEffects } from '../major'
import { getMinorImprovementCost, playImprovement } from '../../effects/improvement'

const buildOptions = (
  available: string[],
  player: PlayerState,
  renovationCost: Partial<PlayerState['resources']>,
): ActionChoiceOption[] => {
  const remainingResources = { ...player.resources }
  Object.entries(renovationCost).forEach(([key, value]) => {
    const resourceKey = key as keyof PlayerState['resources']
    remainingResources[resourceKey] -= value ?? 0
  })
  const improvementOptions = majorCardEffects
    .filter((improvement) => available.includes(improvement.id))
    .filter((improvement) => {
      const cost = getMinorImprovementCost(player, improvement.id)
      const targetCost = cost ?? improvement.cost
      return Object.entries(targetCost).every(([key, value]) => {
        const resourceKey = key as keyof PlayerState['resources']
        const required = value ?? 0
        return remainingResources[resourceKey] >= required
      })
    })
    .map((improvement) => ({
      value: `major:${improvement.id}`,
      labelKey: `improvements.${improvement.id}.name`,
    }))
  const minorOptions = player.minorHand
    .map((id) => getMinorImprovement(id))
    .filter(
      (improvement): improvement is NonNullable<typeof improvement> =>
        !!improvement,
    )
    .filter((improvement) =>
      Object.entries(improvement.cost).every(([key, value]) => {
        const resourceKey = key as keyof PlayerState['resources']
        const required = value ?? 0
        return remainingResources[resourceKey] >= required
      }),
    )
    .map((improvement) => ({
      value: `minor:${improvement.id}`,
      labelKey: `minorImprovements.${improvement.id}.name`,
    }))
  return [
    { value: 'renovate-only', labelKey: 'ui.interactionRenovateOnly' },
    ...improvementOptions,
    ...minorOptions,
  ]
}

export const houseRedevelopment: ActionDefinition = {
  id: 'house-redevelopment',
  nameKey: 'actions.house-redevelopment.name',
  descriptionKey: 'actions.house-redevelopment.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_, player) => {
    const renovation = getRenovation(player)
    if (!renovation) return false
    return canPayResources(player, renovation.cost)
  },
  execute: ({ player, costs }) => {
    const renovation = getRenovation(player)
    if (!renovation) {
      return { type: 'fail', logKey: 'log.renovationFail' }
    }
    const renovationCost = applyCostOverride(renovation.cost, costs)
    if (!canPayResources(player, renovationCost)) {
      return { type: 'fail', logKey: 'log.renovationFail' }
    }
    return {
      type: 'choice',
      promptKey: 'ui.interactionHouseRedevelopmentChoice',
      options: buildOptions(player.improvements, player, renovationCost),
    }
  },
  resolveChoice: ({ state, player, costs }, choice) => {
    if (!renovateHouse(player, costs)) {
      return { type: 'fail', logKey: 'log.renovationFail' }
    }
    if (choice === 'renovate-only') {
      return { type: 'ok' }
    }
    if (!(choice.startsWith('major:') || choice.startsWith('minor:'))) {
      return { type: 'fail', logKey: 'log.renovationFail' }
    }
    return playImprovement(state, player, choice, 'any')
  },
}
