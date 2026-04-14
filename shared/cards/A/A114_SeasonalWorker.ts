import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'A114_SeasonalWorker'

// A114 Seasonal Worker: Each time you use the Day Laborer action space, you get 1 additional GRAIN.
// From round 6 on, you can choose to get 1 VEGETABLE instead.
const listener: CardListenerRegistration = {
  id: 'A114-seasonal-worker-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (!context.space || context.space.id !== 'day-laborer') return
    if (context.state.round < 6) {
      return { flow: gainLeaf(CARD_ID, { grain: 1 }), sourceCard: CARD_ID }
    }
    return {
      flow: {
        type: 'xor',
        children: [
          gainLeaf(CARD_ID, { grain: 1 }),
          gainLeaf(CARD_ID, { vegetable: 1 }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const A114_SeasonalWorker = new Occupation({
  id: CARD_ID,
  name: 'Seasonal Worker',
  deck: 'A',
  number: 114,
  category: 'CROP_PROVIDER',
  desc: ['Each time you use the __Day Laborer__ action space, you get 1 additional <GRAIN>. From round 6 on, you can choose to get 1 <VEGETABLE> instead.'],
  cost: {},
  players: '1+',
})
