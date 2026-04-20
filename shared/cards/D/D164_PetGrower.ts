import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D164_PetGrower'

// After using any animal market space, if no animal in your house, get 1 sheep.
const listener: CardListenerRegistration = {
  id: 'D164-pet-grower-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (spaceId !== 'sheep-market' && spaceId !== 'pig-market' && spaceId !== 'cattle-market') return
    // Check if player has any animals in their house
    if ((context.player.houseAnimalCount ?? 0) > 0) return
    return { flow: gainLeaf(CARD_ID, { sheep: 1 }), sourceCard: CARD_ID }
  },
}

export const D164_PetGrower = new Occupation({
  id: CARD_ID,
  name: 'Pet Grower',
  deck: 'D',
  number: 164,
  category: 'LIVESTOCK_PROVIDER',
  desc: ['Each time you use an animal accumulation space, if afterward you have no animal in your house, you also get 1 <SHEEP>.'],
  cost: {},
  players: '4+',
})

export const D164_PetGrower_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
