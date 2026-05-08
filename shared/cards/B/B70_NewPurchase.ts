import { payGainFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B70_NewPurchase } from '../../cards-display/B/B70_NewPurchase'
export { B70_NewPurchase }

const CARD_ID = B70_NewPurchase.id

const harvestRounds = [4, 7, 9, 11, 13, 14]

export const B70_NewPurchase_impl = {
  effect: {
  id: CARD_ID,
  onBeforeStartOfTurn: (state, _player) => {
    if (!harvestRounds.includes(state.round)) return
    return {
      type: 'seq',
      children: [
        payGainFlow({ cardId: CARD_ID, cost: { food: 2 }, gain: { grain: 1 }, promptKey: 'ui.interactionNewPurchaseGrain' }),
        payGainFlow({ cardId: CARD_ID, cost: { food: 4 }, gain: { vegetable: 1 }, promptKey: 'ui.interactionNewPurchaseVegetable' }),
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
