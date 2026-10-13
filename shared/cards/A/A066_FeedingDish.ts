import { defineMinorCard } from '../card-source'
import { getAssignedAnimalsByType } from '../../domain/animals'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A066_FeedingDish'
type AnimalKey = 'sheep' | 'boar' | 'cattle'

const SPACE_TO_ANIMAL: Record<string, AnimalKey> = {
  'sheep-market': 'sheep',
  'pig-market': 'boar',
  'cattle-market': 'cattle',
}

const listener: CardListenerRegistration = {
  id: 'A66-feeding-dish-before-collect',
  cardIds: [CARD_ID],
  phases: ['before'],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id ?? ''
    const animal = SPACE_TO_ANIMAL[spaceId]
    if (!animal) return
    if (getAssignedAnimalsByType(context.player, context.state)[animal] < 1) return
    return { flow: gainLeaf(CARD_ID, { grain: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A066_FeedingDish = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Feeding Dish',
    deck: 'A',
    number: 66,
    category: 'CROP_PROVIDER',
    desc: ['Each time you use an animal accumulation space while already having an animal of that type, you get 1 <GRAIN>.'],
    cost: { wood: 1 },
  },
  impl: cardImpl,
})

export const A066_FeedingDish_impl = A066_FeedingDish.impl
