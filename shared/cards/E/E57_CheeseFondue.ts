import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'E57_CheeseFondue'

const listener: CardListenerRegistration = {
  id: 'E57-cheese-fondue-after-exchange',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['bake-bread'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    let bonus = 0
    if (context.player.resources.sheep > 0) bonus += 1
    if (context.player.resources.cattle > 0) bonus += 1
    if (bonus <= 0) return
    return { flow: gainLeaf(CARD_ID, { food: bonus }), sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

export const E57_CheeseFondue = new MinorImprovement({
  id: CARD_ID,
  name: "Cheese Fondue",
  deck: "E",
  number: 57,
  category: "FOOD_PROVIDER",
  desc: ['Each time you bake at least 1 <GRAIN> into bread, you get 1 additional <FOOD> if you have at least 1\u00a0<SHEEP> and (another) 1 additional <FOOD> if you have at least 1 <CATTLE>.'],
  cost: { clay: 1 },
  vp: 1,
})
