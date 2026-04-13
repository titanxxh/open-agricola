import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'C142_MarketCrier'

/**
 * After placing farmer on Grain Seeds: optionally gain 1 grain + 1 vegetable,
 * and if you do, each other player gets 1 grain.
 */
const listener: CardListenerRegistration = {
  id: 'C142-market-crier-after-grain-seeds',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (context.space?.id !== 'grain-seeds') return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          gainLeaf(CARD_ID, { grain: 1, vegetable: 1 }),
          { type: 'leaf', actionId: 'gain-other-players', params: { grain: 1 }, sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const C142_MarketCrier = new Occupation({
  id: CARD_ID,
  name: "Market Crier",
  deck: "C",
  number: 142,
  category: "CROP_PROVIDER",
  desc: ["Each time you use the __Grain Seeds__ action space, you can get an additional 1 <GRAIN> and 1 <VEGETABLE>. If you do, each other player gets 1 <GRAIN>."],
  cost: {},
  players: "3+",
})
