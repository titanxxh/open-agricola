import { defineMinorCard } from '../card-source'
import { payGainFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A076_Cob'

const cardImpl = {
  effect: {
  id: CARD_ID,
  stageEligibility: { onWorkStart: (_state, player) => player.resources.clay >= 1 },
  onWorkStart: (_state, player, ctx) => {
    if (!ctx?.roundPreparation && ((player.resources.clay ?? 0) < 1)) return
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

export const A076_Cob = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Cob',
    deck: 'A',
    number: 76,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['At the start of each work phase, if you have at least 1 <CLAY> in your supply, you can exchange exactly 1 <GRAIN> for 2 <CLAY> and 1 <FOOD>.'],
    cost: { food: 1 },
  },
  impl: cardImpl,
})

export const A076_Cob_impl = A076_Cob.impl
