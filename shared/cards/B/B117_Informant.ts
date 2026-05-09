import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B117_Informant } from '../../cards-display/B/B117_Informant'

const CARD_ID = B117_Informant.id

export const B117_Informant_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => gainLeaf(CARD_ID, { wood: 1 }),
  onBeforeReturnHome: (_state, player) => {
    if (player.resources.stone <= player.resources.clay) return
    return gainLeaf(CARD_ID, { wood: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
