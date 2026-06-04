import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A147_AnimalDealer'
type AnimalKey = 'sheep' | 'boar' | 'cattle'

const SPACE_TO_ANIMAL: Record<string, AnimalKey> = {
  'sheep-market': 'sheep',
  'pig-market': 'boar',
  'cattle-market': 'cattle',
}

const listener: CardListenerRegistration = {
  id: 'A147-animal-dealer-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id ?? ''
    const animal = SPACE_TO_ANIMAL[spaceId]
    if (!animal) return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
          gainLeaf(CARD_ID, { [animal]: 1 }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A147_AnimalDealer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Animal Dealer',
    deck: 'A',
    number: 147,
    category: 'LIVESTOCK_PROVIDER',
    desc: ['Each time you use the __Sheep Market__, __Pig Market__, or __Cattle Market__ accumulation space, you can buy 1 additional animal of the respective type for 1 <FOOD>.'],
    cost: {},
    players: '3+',
  },
  impl: cardImpl,
})

export const A147_AnimalDealer_impl = A147_AnimalDealer.impl
