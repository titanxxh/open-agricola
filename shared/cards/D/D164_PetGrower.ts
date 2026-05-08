import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D164_PetGrower } from '../../cards-display/D/D164_PetGrower'
export { D164_PetGrower }

const CARD_ID = D164_PetGrower.id

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

export const D164_PetGrower_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
