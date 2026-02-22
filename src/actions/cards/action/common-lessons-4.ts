import type {
  ActionChoiceOption,
  ActionDefinition,
  PlayerState,
  Resource,
} from '../../../game/types'
import { canPayResources } from '../../effects/pay'
import { playOccupation } from '../../effects/occupation'
import { getOccupation } from '../../../game/occupations'

const getLessonsCost = (player: PlayerState): Partial<Resource> => {
  const base = player.occupationPlayed.length <= 1 ? 1 : 2
  const discount = player.occupationPlayed.includes('B109_PaperMaker') ? 1 : 0
  const food = Math.max(0, base - discount)
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
    .filter(() => canPayResources(player, cost))
    .map((occupation) => ({
      value: occupation.id,
      labelKey: `occupations.${occupation.id}.name`,
    }))

export const lessons4: ActionDefinition = {
  id: 'lessons-4',
  nameKey: 'actions.lessons-4.name',
  descriptionKey: 'actions.lessons-4.description',
  roundAvailable: 1,
  gainPerRound: {},
  players: [4],
  canBeExecutedByPlayer: (_, player) => {
    const cost = getLessonsCost(player)
    return buildPlayableOccupationOptions(player, cost).length > 0
  },
  execute: ({ player }) => {
    const cost = getLessonsCost(player)
    const playableOptions = buildPlayableOccupationOptions(player, cost)
    if (playableOptions.length === 0) {
      return { type: 'ok' }
    }
    return {
      type: 'choice',
      promptKey: 'ui.interactionChooseOccupation',
      options: playableOptions,
    }
  },
  resolveChoice: ({ player }, choice) => {
    if (choice === 'skip') {
      return { type: 'ok' }
    }
    const cost = getLessonsCost(player)
    return playOccupation(player, choice, cost)
  },
}
