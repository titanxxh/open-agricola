import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionFlow } from '../../contract/types'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getAssignedAnimalsByType } from '../../domain/animals'
import {
  isCardFlagged,
  readCardExtraData,
} from '../helpers/card-state'
import { sumActionSpaceMovedToTriggerPlayer } from '../helpers/event-provenance'
import type { CardImpl } from '../registry'

const CARD_ID = 'B034_SpecialFood'
type AnimalType = 'sheep' | 'boar' | 'cattle'

const ANIMALS_BEFORE_KEY = 'animalsBeforeCollecting'
const ANIMAL_TYPES = ['sheep', 'boar', 'cattle'] as const

const actionSpaceAnimalMovedToTriggerPlayer = (
  context: CardListenerContext,
  animalType: AnimalType,
) =>
  sumActionSpaceMovedToTriggerPlayer(context, animalType)

const isAnimalAccumulationSpace = (context: CardListenerContext) => {
  return ANIMAL_TYPES.some((animalType) =>
    actionSpaceAnimalMovedToTriggerPlayer(context, animalType) > 0,
  )
}

const buildBonusVpFlow = (count: number) => ({
  type: 'seq' as const,
  children: [
    { type: 'leaf' as const, actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
    ...Array.from({ length: count }, () => ({
      type: 'leaf' as const,
      actionId: 'bonus-vp',
      sourceCard: CARD_ID,
    })),
  ],
})

const buildSpecialFoodFlow = (count: number, ambiguous: boolean): ActionFlow => {
  const flow = buildBonusVpFlow(count)
  if (!ambiguous) return flow
  return {
    ...flow,
    optional: true,
    promptKey: 'ui.interactionReclamationPlowAmbiguous',
    choiceLabelKey: 'ui.interactionReclamationPlowUse',
  }
}

const beforeListener: CardListenerRegistration = {
  id: 'B34-special-food-before-collect',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: CARD_ID,
        params: {
          kind: 'set-extra-data',
          key: ANIMALS_BEFORE_KEY,
          value: getAssignedAnimalsByType(context.player, context.state),
        },
      },
      sourceCard: CARD_ID,
      countCardUse: false,
    }
  },
}

const afterListener: CardListenerRegistration = {
  id: 'B34-special-food-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (!isAnimalAccumulationSpace(context)) return

    const animalsBeforeCollecting = readCardExtraData<Record<AnimalType, number>>(
      context.player,
      CARD_ID,
      ANIMALS_BEFORE_KEY,
    )
    if (!animalsBeforeCollecting) return

    const obtainedAnimals: Record<AnimalType, number> = {
      sheep: actionSpaceAnimalMovedToTriggerPlayer(context, 'sheep'),
      boar: actionSpaceAnimalMovedToTriggerPlayer(context, 'boar'),
      cattle: actionSpaceAnimalMovedToTriggerPlayer(context, 'cattle'),
    }
    const totalObtained =
      obtainedAnimals.sheep + obtainedAnimals.boar + obtainedAnimals.cattle
    if (totalObtained <= 0) return

    const animalsAfterCollecting = getAssignedAnimalsByType(context.player, context.state)
    let ambiguous = false
    for (const animalType of ANIMAL_TYPES) {
      const after = animalsAfterCollecting[animalType]
      const obtained = obtainedAnimals[animalType]
      if (after < obtained) {
        return
      }
      if (after < obtained + animalsBeforeCollecting[animalType]) {
        ambiguous = true
      }
    }

    return { flow: buildSpecialFoodFlow(totalObtained, ambiguous) }
  },
}

const cardImpl = {
  listeners: [beforeListener, afterListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B034_SpecialFood = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Special Food",
    deck: "B",
    number: 34,
    category: "POINTS_PROVIDER",
    desc: ["The next time you take animals from an accumulation space and accommodate all of them on your farm, you get 1 bonus <SCORE> for each of these animals."],
    cost: {},
    prerequisite: "No Animal",
    extraVp: true,
  },
  impl: cardImpl,
})

export const B034_SpecialFood_impl = B034_SpecialFood.impl
