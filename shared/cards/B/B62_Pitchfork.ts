import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { isSpaceOccupied } from '../../domain/space'
import type { CardImpl } from '../registry'

const CARD_ID = 'B62_Pitchfork'

const listener: CardListenerRegistration = {
  id: 'B62-pitchfork-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'grain-seeds') return
    const farmland = context.state.actionSpaces.find((s) => s.id === 'farmland')
    if (!farmland || !isSpaceOccupied(farmland)) return
    return { flow: gainLeaf(CARD_ID, { food: 3 }), sourceCard: CARD_ID }
  },
}

export const B62_Pitchfork = new MinorImprovement({
  id: CARD_ID,
  name: 'Pitchfork',
  deck: 'B',
  number: 62,
  category: 'FOOD_PROVIDER',
  desc: ['Each time you use the __Grain Seeds__ action space, if the __Farmland__ action space is occupied you also get 3 <FOOD>.'],
  cost: { wood: 1 },
})

export const B62_Pitchfork_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
