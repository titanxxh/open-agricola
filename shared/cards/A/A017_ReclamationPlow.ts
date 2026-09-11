import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionFlow } from '../../contract/types'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionSpace } from '../../contract/types'
import { getAssignedAnimalsByType } from '../../domain/animals'
import { isCardFlagged, readCardExtraData } from '../helpers/card-state'
import { sumResourceMovedFromActionSpace } from '../helpers/event-provenance'
import type { CardImpl } from '../registry'

const CARD_ID = 'A017_ReclamationPlow'
type AnimalType = 'sheep' | 'boar' | 'cattle'

const USED_INFOBOX = '✓'
const ANIMALS_BEFORE_KEY = 'animalsBeforeCollecting'

const isAnimalAccumulationSpace = (space: ActionSpace): boolean => {
  const gainPerRound = space.gainPerRound ?? {}
  return (gainPerRound.sheep ?? 0) > 0 ||
         (gainPerRound.boar ?? 0) > 0 ||
         (gainPerRound.cattle ?? 0) > 0
}

const buildReclamationPlowUseFlow = (): ActionFlow => ({
  type: 'seq',
  children: [
    specialEffect({ kind: 'set-flag', flag: true }),
    specialEffect({ kind: 'set-infobox', text: USED_INFOBOX }),
    {
      type: 'leaf',
      actionId: 'plow',
      sourceCard: CARD_ID,
      optional: true,
      promptKey: 'ui.interactionReclamationPlow',
      choiceLabelKey: 'ui.interactionReclamationPlowUse',
    },
  ],
})

const specialEffect = (params: Record<string, unknown>): ActionFlow => ({
  type: 'leaf',
  actionId: 'special-effect',
  sourceCard: CARD_ID,
  params,
})

const countObtainedAnimalFromActionSpace = (
  context: CardListenerContext,
  animalType: AnimalType,
): number => {
  const events = context.actionEvents ?? context.transactionEvents
  return sumResourceMovedFromActionSpace(events, animalType, (event) =>
    event.to.kind === 'player' && event.to.playerId === context.player.id,
  )
}

const reclamationPlowBeforeCollectListener: CardListenerRegistration = {
  id: 'A17-reclamation-plow-before',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isAnimalAccumulationSpace(context.space)) return
    if (isCardFlagged(context.player, CARD_ID)) return
    return {
      flow: specialEffect({
        kind: 'set-extra-data',
        key: ANIMALS_BEFORE_KEY,
        value: getAssignedAnimalsByType(context.player, context.state),
      }),
      sourceCard: CARD_ID,
      countCardUse: false,
    }
  },
}

const reclamationPlowAfterCollectListener: CardListenerRegistration = {
  id: 'A17-reclamation-plow-after',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { space, player } = context
    if (!isAnimalAccumulationSpace(space)) return
    if (isCardFlagged(player, CARD_ID)) return

    const obtainedAnimals: Record<AnimalType, number> = {
      sheep: countObtainedAnimalFromActionSpace(context, 'sheep'),
      boar: countObtainedAnimalFromActionSpace(context, 'boar'),
      cattle: countObtainedAnimalFromActionSpace(context, 'cattle'),
    }
    const totalObtained = obtainedAnimals.sheep + obtainedAnimals.boar + obtainedAnimals.cattle
    if (totalObtained <= 0) return

    const animalsBeforeCollecting = readCardExtraData<Record<AnimalType, number>>(
      player,
      CARD_ID,
      ANIMALS_BEFORE_KEY,
    )
    if (!animalsBeforeCollecting) return

    const animalsAfterCollecting = getAssignedAnimalsByType(player, context.state)
    for (const animalType of ['sheep', 'boar', 'cattle'] as AnimalType[]) {
      if (animalsAfterCollecting[animalType] <
        animalsBeforeCollecting[animalType] + obtainedAnimals[animalType]) return
    }

    return { flow: buildReclamationPlowUseFlow() }
  },
}

const cardImpl = {
  listeners: [reclamationPlowBeforeCollectListener, reclamationPlowAfterCollectListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A017_ReclamationPlow = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Reclamation Plow",
    deck: "A",
    number: 17,
    category: "FARM_PLANNER",
    desc: ["After the next time you take animals from an accumulation space and accommodate all of them on your farm, you can plow 1 <FIELD>."],
    cost: {"wood":1},
  },
  impl: cardImpl,
})

export const A017_ReclamationPlow_impl = A017_ReclamationPlow.impl
