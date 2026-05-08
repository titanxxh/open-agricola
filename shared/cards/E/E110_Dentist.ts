import { getCardStack } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E110_Dentist } from '../../cards-display/E/E110_Dentist'
export { E110_Dentist }

const CARD_ID = E110_Dentist.id

export const E110_Dentist_impl = {
  effect: {
  id: CARD_ID,
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
