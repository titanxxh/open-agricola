import { getMinorImprovementCost } from '../../effects/improvement'
import { canPayResources } from '../../effects/pay'
import type { ActionDefinition, ActionChoiceOption, PlayerState } from '../../../game/types'
import { getMinorImprovement } from '../../../game/minor-improvements'
import { majorCardEffects } from '../major'

const buildImprovementOptions = (
  available: string[],
  player: PlayerState,
): ActionChoiceOption[] =>
  majorCardEffects
    .filter((improvement) => available.includes(improvement.id))
    .filter((improvement) => {
      const cost =
        getMinorImprovementCost(player, improvement.id) ?? improvement.cost
      return canPayResources(player, cost)
    })
    .map((improvement) => ({
      value: `major:${improvement.id}`,
      labelKey: `improvements.${improvement.id}.name`,
    }))

const buildMinorOptions = (player: PlayerState): ActionChoiceOption[] =>
  player.minorHand
    .map((id) => getMinorImprovement(id))
    .filter(
      (improvement): improvement is NonNullable<typeof improvement> =>
        !!improvement,
    )
    .filter((improvement) => canPayResources(player, improvement.cost))
    .map((improvement) => ({
      value: `minor:${improvement.id}`,
      labelKey: `minorImprovements.${improvement.id}.name`,
    }))

export const majorImprovement: ActionDefinition = {
  id: 'major-improvement',
  nameKey: 'actions.major-improvement.name',
  descriptionKey: 'actions.major-improvement.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (state, player) =>
    buildImprovementOptions(state.availableMajorImprovements, player).length >
      0 || buildMinorOptions(player).length > 0,
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'seq',
    children: [{ type: 'leaf', actionId: 'improvement-any' }],
  },
}
