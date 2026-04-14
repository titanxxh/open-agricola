import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'A138_Harpooner'

// A138 Harpooner: Each time you use the Fishing space you can also pay 1 WOOD to get
// 1 FOOD for each person you have, and 1 REED.
const listener: CardListenerRegistration = {
  id: 'A138-harpooner-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (!context.space || context.space.id !== 'fishing') return
    const foodGain = context.player.familySize
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { wood: 1 } }),
          gainLeaf(CARD_ID, { food: foodGain, reed: 1 }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const A138_Harpooner = new Occupation({
  id: CARD_ID,
  name: 'Harpooner',
  deck: 'A',
  number: 138,
  category: 'GOODS_PROVIDER',
  desc: ['Each time you use the __Fishing__ space you can also pay 1 <WOOD> to get 1 <FOOD> for each person you have, and 1 <REED>.'],
  cost: {},
  players: '3+',
})
