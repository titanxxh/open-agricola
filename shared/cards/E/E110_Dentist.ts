import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { getCardStack } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'E110_Dentist'

registerCardEffect({
  id: CARD_ID,
  // At start of each harvest: optionally pay 1 wood to place on card
  onStartHarvest: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    if (player.resources.wood < 1) return
    return {
      type: 'seq',
      optional: true,
      children: [
        { type: 'leaf', actionId: 'pay-resources', params: { wood: 1 }, sourceCard: CARD_ID },
        { type: 'leaf', actionId: 'push-to-card-stack', params: { item: 'wood' }, sourceCard: CARD_ID },
        { type: 'leaf', actionId: 'set-card-infobox', params: { text: `${getCardStack(player, CARD_ID).length + 1} Wood` }, sourceCard: CARD_ID },
      ],
    }
  },
  // In feeding phase: get 1 food per wood on card
  onHarvestFeedingPhase: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    const woodCount = getCardStack(player, CARD_ID).length
    if (woodCount <= 0) return
    return gainLeaf(CARD_ID, { food: woodCount })
  },
})

export const E110_Dentist = new Occupation({
  id: CARD_ID,
  name: 'Dentist',
  deck: 'E',
  number: 110,
  category: 'FOOD_PROVIDER',
  desc: ['At the start of each harvest, you can place 1 <WOOD> from your supply on this card (irretrievable). In each feeding phase, you get 1 <FOOD> for each <WOOD> on this card.'],
  cost: {},
  players: '1+',
})
