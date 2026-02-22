import { bakeBread, type BakeImprovementId } from '../effects/bake-bread'
import { sowCrop } from '../effects/sow'
import type { ActionChoiceOption, ActionDefinition, PlayerState } from '../../game/types'

const bakeImprovements: BakeImprovementId[] = [
  'Major_Fireplace1',
  'Major_Fireplace2',
  'Major_CookingHearth1',
  'Major_CookingHearth2',
  'Major_ClayOven',
  'Major_StoneOven',
]

const bakeLabelKey: Record<BakeImprovementId, string> = {
  Major_Fireplace1: 'ui.interactionBakeBreadFireplace',
  Major_Fireplace2: 'ui.interactionBakeBreadFireplace',
  Major_CookingHearth1: 'ui.interactionBakeBreadCookingHearth',
  Major_CookingHearth2: 'ui.interactionBakeBreadCookingHearth',
  Major_ClayOven: 'ui.interactionBakeBreadClayOven',
  Major_StoneOven: 'ui.interactionBakeBreadStoneOven',
}

const sowGrainBakeLabelKey: Record<BakeImprovementId, string> = {
  Major_Fireplace1: 'ui.interactionSowGrainBakeFireplace',
  Major_Fireplace2: 'ui.interactionSowGrainBakeFireplace',
  Major_CookingHearth1: 'ui.interactionSowGrainBakeCookingHearth',
  Major_CookingHearth2: 'ui.interactionSowGrainBakeCookingHearth',
  Major_ClayOven: 'ui.interactionSowGrainBakeClayOven',
  Major_StoneOven: 'ui.interactionSowGrainBakeStoneOven',
}

const sowVegetableBakeLabelKey: Record<BakeImprovementId, string> = {
  Major_Fireplace1: 'ui.interactionSowVegetableBakeFireplace',
  Major_Fireplace2: 'ui.interactionSowVegetableBakeFireplace',
  Major_CookingHearth1: 'ui.interactionSowVegetableBakeCookingHearth',
  Major_CookingHearth2: 'ui.interactionSowVegetableBakeCookingHearth',
  Major_ClayOven: 'ui.interactionSowVegetableBakeClayOven',
  Major_StoneOven: 'ui.interactionSowVegetableBakeStoneOven',
}

const buildOptions = (player: PlayerState) => {
  const options: ActionChoiceOption[] = []
  const hasEmptyField = player.fields.some((field) => field.crop === null)
  const grain = player.resources.grain
  const vegetable = player.resources.vegetable
  const bakeable = bakeImprovements.filter((id) =>
    player.improvements.includes(id),
  )

  if (hasEmptyField && grain > 0) {
    options.push({ value: 'sow-grain', labelKey: 'ui.interactionSowGrain' })
  }
  if (hasEmptyField && vegetable > 0) {
    options.push({
      value: 'sow-vegetable',
      labelKey: 'ui.interactionSowVegetable',
    })
  }
  if (grain > 0) {
    bakeable.forEach((id) => {
      options.push({ value: `bake-${id}`, labelKey: bakeLabelKey[id] })
    })
  }
  if (hasEmptyField) {
    if (grain > 1) {
      bakeable.forEach((id) => {
        options.push({
          value: `sow-grain-bake-${id}`,
          labelKey: sowGrainBakeLabelKey[id],
        })
      })
    }
    if (vegetable > 0 && grain > 0) {
      bakeable.forEach((id) => {
        options.push({
          value: `sow-vegetable-bake-${id}`,
          labelKey: sowVegetableBakeLabelKey[id],
        })
      })
    }
  }

  return options
}

export const grainUtilization: ActionDefinition = {
  id: 'grain-utilization',
  nameKey: 'actions.grain-utilization.name',
  descriptionKey: 'actions.grain-utilization.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_, player) =>
    buildOptions(player).length > 0,
  execute: ({ player }) => ({
    type: 'choice',
    promptKey: 'ui.interactionGrainUtilizationChoice',
    options: buildOptions(player),
  }),
  resolveChoice: ({ player }, choice) => {
    if (choice === 'sow-grain') {
      return sowCrop(player, 'grain')
    }
    if (choice === 'sow-vegetable') {
      return sowCrop(player, 'vegetable')
    }
    if (choice.startsWith('bake-')) {
      const improvement = choice.replace('bake-', '')
      if (bakeImprovements.includes(improvement as BakeImprovementId)) {
        return bakeBread(player, improvement as BakeImprovementId)
      }
    }
    if (choice.startsWith('sow-grain-bake-')) {
      const improvement = choice.replace('sow-grain-bake-', '')
      const sowResult = sowCrop(player, 'grain')
      if (sowResult.type === 'fail') return sowResult
      if (bakeImprovements.includes(improvement as BakeImprovementId)) {
        return bakeBread(player, improvement as BakeImprovementId)
      }
      return sowResult
    }
    if (choice.startsWith('sow-vegetable-bake-')) {
      const improvement = choice.replace('sow-vegetable-bake-', '')
      const sowResult = sowCrop(player, 'vegetable')
      if (sowResult.type === 'fail') return sowResult
      if (bakeImprovements.includes(improvement as BakeImprovementId)) {
        return bakeBread(player, improvement as BakeImprovementId)
      }
      return sowResult
    }
    return { type: 'ok' }
  },
}
