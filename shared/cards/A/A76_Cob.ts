import { MinorImprovement } from '../types'
import { payGainFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A76_Cob'

export const A76_Cob = new MinorImprovement({
  id: CARD_ID,
  name: 'Cob',
  deck: 'A',
  number: 76,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['At the start of each work phase, if you have at least 1 <CLAY> in your supply, you can exchange exactly 1 <GRAIN> for 2 <CLAY> and 1 <FOOD>.'],
  cost: { food: 1 },
  newSet: true,
})

export const A76_Cob_impl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    if ((player.resources.clay ?? 0) < 1) return
    if ((player.resources.grain ?? 0) < 1) return
    return payGainFlow({
      cardId: CARD_ID,
      cost: { grain: 1 },
      gain: { clay: 2, food: 1 },
      promptKey: 'ui.interactionCob',
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
