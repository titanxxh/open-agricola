import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A51_DriftNetBoat'

// A51 Drift-Net Boat: Each time you use the Fishing accumulation space, you get an additional 2 FOOD.
const listener: CardListenerRegistration = {
  id: 'A51-drift-net-boat-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || context.space.id !== 'fishing') return
    return { flow: gainLeaf(CARD_ID, { food: 2 }), sourceCard: CARD_ID }
  },
}

export const A51_DriftNetBoat = new MinorImprovement({
  id: CARD_ID,
  name: 'Drift-Net Boat',
  deck: 'A',
  number: 51,
  category: 'FOOD_PROVIDER',
  desc: ['Each time you use the __Fishing__ accumulation space, you get an additional 2 <FOOD>.'],
  cost: { wood: 1, reed: 1 },
  vp: 1,
  newSet: true,
})

export const A51_DriftNetBoat_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
