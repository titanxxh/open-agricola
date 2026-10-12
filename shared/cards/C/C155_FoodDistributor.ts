import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { writeCardExtraData } from '../helpers/card-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'C155_FoodDistributor'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    writeCardExtraData(player, CARD_ID, 'purchaseRound', state.round)
    return gainLeaf(CARD_ID, { grain: 1 })
  },
  timedRules: [{ retainAfterCardLeaves: true, key: 'occupied-round-reward', at: { kind: 'card-round', fact: 'purchaseRound', phase: 'onStartReturnHome' }, body: { kind: 'gain', resources: { food: { kind: 'occupied-round-spaces' } } } }],
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C155_FoodDistributor = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Food Distributor',
    deck: 'C',
    number: 155,
    category: 'GOODS_PROVIDER',
    desc: [
        'When you play this card, you immediately get 1 <GRAIN> and, at the start of this returning home phase, an amount of <FOOD> equal to the number of occupied Round 1-14 action spaces.',
      ],
    cost: {},
    players: '4+',
  },
  impl: cardImpl,
})

export const C155_FoodDistributor_impl = C155_FoodDistributor.impl
