import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { countHouseAnimals } from '../../domain'

const CARD_ID = 'D164_PetGrower'

const listener: CardListenerRegistration = {
  id: 'D164-pet-grower-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (spaceId !== 'sheep-market' && spaceId !== 'pig-market' && spaceId !== 'cattle-market') return
    if (countHouseAnimals(context.player, context.state) > 0) return
    return { flow: gainLeaf(CARD_ID, { sheep: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D164_PetGrower = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Pet Grower',
    deck: 'D',
    number: 164,
    category: 'LIVESTOCK_PROVIDER',
    desc: ['Each time you use an animal accumulation space, if afterward you have no animal in your house, you also get 1 <SHEEP>.'],
    cost: {},
    players: '4+',
  },
  impl: cardImpl,
})

export const D164_PetGrower_impl = D164_PetGrower.impl
