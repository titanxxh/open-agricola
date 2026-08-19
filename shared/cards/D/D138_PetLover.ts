import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D138_PetLover'
const ANIMAL_MARKET_SPACES: Record<string, 'sheep' | 'boar' | 'cattle'> = {
  'sheep-market': 'sheep',
  'pig-market': 'boar',
  'cattle-market': 'cattle',
}

/**
 * D138 Pet Lover — Each time you use an accumulation space providing exactly 1 animal,
 * you can leave it on the space and get one from the general supply instead,
 * as well as 3 <FOOD> and 1 <GRAIN>.
 *
 * Rule: onPlayerComputePlaceFarmerFlow wraps the entire collect flow in an XOR
 * (normal collect vs PetLover bonus). We achieve the same shape with a
 * computeReplace listener on the 'collect' action: returning `decline: true`
 * with an alternativeFlow makes the engine build XOR(alternative, original-with-sentinel).
 */
const computeReplaceListener: CardListenerRegistration = {
  id: 'D138-pet-lover-replace-collect',
  cardIds: [CARD_ID],
  phases: ['computeReplace' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.actionContext?.checkedReplaceAction) return
    const spaceId = context.space?.id
    const animalType = spaceId ? ANIMAL_MARKET_SPACES[spaceId] : undefined
    if (!animalType) return
    const r = context.space?.resources ?? {}
    const totalAnimals = (r.sheep ?? 0) + (r.boar ?? 0) + (r.cattle ?? 0)
    if (totalAnimals !== 1) return

    return {
      decline: true,
      alternativeFlow: {
        type: 'seq',
        choiceLabelKey: 'ui.interactionPetLoverBonus',
        children: [
          gainLeaf(CARD_ID, { [animalType]: 1, food: 3, grain: 1 }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [computeReplaceListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D138_PetLover = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Pet Lover',
    deck: 'D',
    number: 138,
    category: 'GOODS_PROVIDER',
    desc: ['Each time you use an accumulation space providing exactly 1 animal, you can leave it on the space and get one from the general supply instead, as well as 3 <FOOD> and 1 <GRAIN>.'],
    cost: {},
    players: '3+',
  },
  impl: cardImpl,
})

export const D138_PetLover_impl = D138_PetLover.impl
