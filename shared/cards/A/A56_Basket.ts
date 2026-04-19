import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { returnToSpaceThenGainFlow } from '../helpers/pay-gain-node'

const CARD_ID = 'A56_Basket'

const isWoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space?.gainPerRound?.wood ?? 0) > 0

// A56 Basket: Immediately after each time you use a wood accumulation space, you can
// exchange 2 wood for 3 food. Place those 2 wood back on the accumulation space.
const listener: CardListenerRegistration = {
  id: 'A56-basket-immediately-after-collect',
  cardIds: [CARD_ID],
  phases: ['immediatelyAfter' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isWoodAccumulationSpace(context.space)) return
    return returnToSpaceThenGainFlow({
      cardId: CARD_ID,
      cost: { wood: 2 },
      gain: { food: 3 },
      choiceLabelKey: 'minors.A56_Basket.name',
    })
  },
}

registerCardListener(listener)

export const A56_Basket = new MinorImprovement({
  id: CARD_ID,
  name: 'Basket',
  deck: 'A',
  number: 56,
  category: 'FOOD_PROVIDER',
  desc: ['Immediately after each time you use a wood accumulation space, you can exchange 2 <WOOD> for 3 <FOOD>. If you do, place those 2 <WOOD> on the accumulation space.'],
  cost: { reed: 1 },
})
