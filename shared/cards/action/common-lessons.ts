import type {
  ActionChoiceOption,
  ActionDefinition,
  PlayerState,
  Resource,
} from '../../game/types'
import { canAffordOccupationActionCost } from '../../actions/effects/occupation'
import { getOccupation } from '../../game/occupations'

const getLessonsCost = (player: PlayerState): Partial<Resource> => {
  const base = player.occupationPlayed.length === 0 ? 0 : 1
  const food = Math.max(0, base)
  return food > 0 ? { food } : {}
}

const buildPlayableOccupationOptions = (
  player: PlayerState,
  cost: Partial<Resource>,
): ActionChoiceOption[] =>
  player.occupationHand
    .map((id) => getOccupation(id))
    .filter(
      (occupation): occupation is NonNullable<typeof occupation> =>
        !!occupation,
    )
    .filter(() => canAffordOccupationActionCost(player, cost))
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
  canBeExecutedByPlayer: (_, player) => {
    const cost = getLessonsCost(player)
    return buildPlayableOccupationOptions(player, cost).length > 0
  },
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'seq',
    children: [{ type: 'leaf', actionId: 'play-occupation' }],
  },
}
