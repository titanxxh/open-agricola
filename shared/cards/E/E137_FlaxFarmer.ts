import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'E137_FlaxFarmer'

// Each time you use Reed Bank, also get 1 grain.
// Each time you use Grain Seeds, also get 1 reed.
const listener: CardListenerRegistration = {
  id: 'E137-flax-farmer-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    const spaceId = context.space?.id
    if (spaceId === 'reed-bank') {
      return { flow: gainLeaf(CARD_ID, { grain: 1 }), sourceCard: CARD_ID }
    }
    if (spaceId === 'grain-seeds') {
      return { flow: gainLeaf(CARD_ID, { reed: 1 }), sourceCard: CARD_ID }
    }
  },
}

registerCardListener(listener)

export const E137_FlaxFarmer = new Occupation({
  id: CARD_ID,
  name: 'Flax Farmer',
  deck: 'E',
  number: 137,
  category: 'GOODS_PROVIDER',
  desc: ['Each time you use the __Reed Bank__ accumulation space, you also get 1 <GRAIN>. Each time you use the __Grain Seeds__ action space, you also get 1 <REED>.'],
  cost: {},
  players: '3+',
})
