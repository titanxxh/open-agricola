import type {
  ActionChoiceOption,
  ActionDefinition,
  PlayerState,
  Resource,
} from '../../contract/types'
import { canAffordOccupationActionCost } from '../../actions/effects/occupation'
import { getOccupation } from '../../cards-display/_lookup'

const getLessonsCost = (player: PlayerState): Partial<Resource> => {
  const base = player.occupationPlayed.length === 0 ? 0 : 1
  const food = Math.max(0, base)
  return food > 0 ? { food } : {}
}

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
      canAffordOccupationActionCost(state, player, occupation.id, cost, 'lessons'),
    )
    .map((occupation) => ({
      value: occupation.id,
      labelKey: `occupations.${occupation.id}.name`,
    }))

export const lessons: ActionDefinition = {
  id: 'lessons',
  nameKey: 'actions.lessons.name',
  descriptionKey: 'actions.lessons.description',
  roundAvailable: 1,
  gainPerRound: {},
  players: [2, 3, 4],
  canBeExecutedByPlayer: (state, player) => {
    const cost = getLessonsCost(player)
    return buildPlayableOccupationOptions(state, player, cost).length > 0
  },
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'seq',
    children: [{ type: 'leaf', actionId: 'occupation' }],
  },
}
