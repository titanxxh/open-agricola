import { canBakeBread, type BakeImprovementId } from '../../actions/effects/bake-bread'
import { canSow } from '../../actions/effects/sow'
import type { ActionDefinition, PlayerState } from '../../game/types'

const bakeImprovements: BakeImprovementId[] = [
  'Major_Fireplace1',
  'Major_Fireplace2',
  'Major_CookingHearth1',
  'Major_CookingHearth2',
  'Major_ClayOven',
  'Major_StoneOven',
]

const hasBakeableImprovement = (player: PlayerState) =>
  bakeImprovements.some((id) => canBakeBread(player, id))

export const grainUtilization: ActionDefinition = {
  id: 'grain-utilization',
  nameKey: 'actions.grain-utilization.name',
  descriptionKey: 'actions.grain-utilization.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_, player) =>
    canSow(player) || hasBakeableImprovement(player),
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'or',
    promptKey: 'ui.interactionGrainUtilizationChoice',
    children: [
      { type: 'leaf', actionId: 'sow' },
      { type: 'leaf', actionId: 'bake-bread' },
    ],
  },
}
