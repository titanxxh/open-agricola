import { defineOccupationCard } from '../card-source'
import { getCardStack } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E110_Dentist'

const cardImpl = {
  effect: {
  id: CARD_ID,
  preHarvestGoodsWanted: ['wood'],
  // At start of each harvest: optionally pay 1 wood to place on card
  onStartHarvest: (_state, player) => {
    if (player.resources.wood < 1) return
    return {
      type: 'seq',
      optional: true,
      children: [
        { type: 'leaf', actionId: 'pay', params: { wood: 1 }, sourceCard: CARD_ID },
        { type: 'leaf', actionId: 'push-to-card-stack', params: { item: 'wood' }, sourceCard: CARD_ID },
        { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-infobox', text: `${getCardStack(player, CARD_ID).length + 1} Wood` } },
      ],
    }
  },
  // In feeding phase: get 1 food per wood on card
  onHarvestFeedingPhase: (_state, player) => {
    const woodCount = getCardStack(player, CARD_ID).length
    if (woodCount <= 0) return
    return gainLeaf(CARD_ID, { food: woodCount })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E110_Dentist = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Dentist',
    deck: 'E',
    number: 110,
    category: 'FOOD',
    desc: ['At the start of each harvest, you can place 1 <WOOD> from your supply on this card, irretrievably. In each feeding phase, you get 1 <FOOD> for each <WOOD> on this card.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const E110_Dentist_impl = E110_Dentist.impl
