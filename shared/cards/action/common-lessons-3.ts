import type {
  ActionChoiceOption,
  ActionDefinition,
  PlayerState,
  Resource,
} from '../../contract/types'
import { canAffordOccupationActionCost } from '../../actions/effects/occupation'
import { getOccupation } from '../../cards-display/_lookup'

const LESSONS_3_COST: Partial<Resource> = { food: 2 }

const buildPlayableOccupationOptions = (
  state: Parameters<NonNullable<ActionDefinition['canBeExecutedByPlayer']>>[0],
  player: PlayerState,
  cost: Partial<Resource>,
): ActionChoiceOption[] =>
  player.occupationHand
    .map((id) => getOccupation(id))
    .filter(
      (occupation): occupation is NonNullable<typeof occupation> =>
        !!occupation,
    )
    .filter((occupation) =>
      canAffordOccupationActionCost(state, player, occupation.id, cost, 'lessons-3'),
    )
    .map((occupation) => ({
      value: occupation.id,
      labelKey: `occupations.${occupation.id}.name`,
    }))

export const lessons3: ActionDefinition = {
  id: 'lessons-3',
  nameKey: 'actions.lessons-3.name',
  descriptionKey: 'actions.lessons-3.description',
  roundAvailable: 1,
  gainPerRound: {},
  players: [3],
  canBeExecutedByPlayer: (state, player) => {
    return buildPlayableOccupationOptions(state, player, LESSONS_3_COST).length > 0
  },
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'seq',
    children: [{ type: 'leaf', actionId: 'play-occupation' }],
  },
}
