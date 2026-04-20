import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B144_Collier'

const listener: CardListenerRegistration = {
  id: 'B144-collier-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  // Higher order to run after regular place-farmer effects (onPlayerAfterPlaceFarmer)
  order: 10,
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const id = context.space?.id
    if (id === 'clay-pit') {
      return { flow: gainLeaf(CARD_ID, { wood: 1, reed: 1 }), sourceCard: CARD_ID }
    }
    if (id === 'hollow-4') {
      return { flow: gainLeaf(CARD_ID, { wood: 1 }), sourceCard: CARD_ID }
    }
  },
}

export const B144_Collier = new Occupation({
  id: CARD_ID,
  name: 'Collier',
  deck: 'B',
  number: 144,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Each time after you use the __Clay Pit__ or __Hollow__ accumulation space, you get 1 <WOOD>. On __Clay Pit__ you also get 1 additional <REED>.'],
  cost: {},
  players: '3+',
  newSet: true,
})

export const B144_Collier_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
