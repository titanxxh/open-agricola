import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionFlow } from '../../game/types'
import type { ActionHookPhase, ActionHookResult, } from '../../actions/hooks'
import type { ActionSpace, PlayerState, Pasture } from '../../game/types'
import {
  isCardFlagged,
  readCardExtraData,
  writeCardExtraData,
} from '../helpers/card-state'

type AnimalType = 'sheep' | 'boar' | 'cattle'

const CARD_ID = 'B34_SpecialFood'
const ANIMALS_BEFORE_KEY = 'animalsBeforeCollecting'

const isAnimalAccumulationSpace = (space: ActionSpace): boolean => {
  const gainPerRound = space.gainPerRound ?? {}
  return (gainPerRound.sheep ?? 0) > 0 ||
    (gainPerRound.boar ?? 0) > 0 ||
    (gainPerRound.cattle ?? 0) > 0
}

const getAnimalCountByType = (player: PlayerState): Record<AnimalType, number> => ({
  sheep: (player.houseAnimalType === 'sheep' ? player.houseAnimalCount : 0) +
    Object.values(player.stableAnimals ?? {}).filter((animal) => animal === 'sheep').length +
    (player.pastures ?? []).reduce(
      (sum: number, pasture: Pasture) => sum + (pasture.animalType === 'sheep' ? pasture.animalCount : 0),
      0,
    ),
  boar: (player.houseAnimalType === 'boar' ? player.houseAnimalCount : 0) +
    Object.values(player.stableAnimals ?? {}).filter((animal) => animal === 'boar').length +
    (player.pastures ?? []).reduce(
      (sum: number, pasture: Pasture) => sum + (pasture.animalType === 'boar' ? pasture.animalCount : 0),
      0,
    ),
  cattle: (player.houseAnimalType === 'cattle' ? player.houseAnimalCount : 0) +
    Object.values(player.stableAnimals ?? {}).filter((animal) => animal === 'cattle').length +
    (player.pastures ?? []).reduce(
      (sum: number, pasture: Pasture) => sum + (pasture.animalType === 'cattle' ? pasture.animalCount : 0),
      0,
    ),
})

const buildBonusVpFlow = (count: number): ActionFlow => ({
  type: 'seq',
  children: [
    ...Array.from({ length: count }, () => ({
      type: 'leaf' as const,
      actionId: 'bonus-vp',
      sourceCard: CARD_ID,
    })),
    {
      type: 'leaf',
      actionId: 'flag-card',
      sourceCard: CARD_ID,
    },
  ],
})

const beforeCollectListener: CardListenerRegistration = {
  id: 'B34-special-food-before-collect',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (!isAnimalAccumulationSpace(context.space)) return
    writeCardExtraData(
      context.player,
      CARD_ID,
      ANIMALS_BEFORE_KEY,
      getAnimalCountByType(context.player),
    )
  },
}

const afterCollectListener: CardListenerRegistration = {
  id: 'B34-special-food-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (!isAnimalAccumulationSpace(context.space)) return
    const animalsBefore = readCardExtraData<Record<AnimalType, number>>(
      context.player,
      CARD_ID,
      ANIMALS_BEFORE_KEY,
    )
    const resourcesGained =
      context.result?.type === 'ok' ? context.result.resourcesGained : undefined
    if (!animalsBefore || !resourcesGained) return
    const obtainedAnimals: Record<AnimalType, number> = {
      sheep: resourcesGained.sheep ?? 0,
      boar: resourcesGained.boar ?? 0,
      cattle: resourcesGained.cattle ?? 0,
    }
    const totalObtained = obtainedAnimals.sheep + obtainedAnimals.boar + obtainedAnimals.cattle
    if (totalObtained <= 0) return

    const animalsAfter = getAnimalCountByType(context.player)
    for (const animalType of ['sheep', 'boar', 'cattle'] as AnimalType[]) {
      if (animalsAfter[animalType] < animalsBefore[animalType] + obtainedAnimals[animalType]) {
        return
      }
    }

    return {
      flow: buildBonusVpFlow(totalObtained),
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(beforeCollectListener)
registerCardListener(afterCollectListener)

export const B34_SpecialFood = new MinorImprovement({
  id: CARD_ID,
  name: "Special Food",
  deck: "B",
  number: 34,
  category: "POINTS_PROVIDER",
  desc: ["The next time you take animals from an accumulation space and accommodate all of them on your farm, you get 1 bonus <SCORE> for each of these animals."],
  cost: {},
  prerequisite: "No Animal",
})
