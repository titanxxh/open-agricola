import { gainLeaf } from '../helpers/pay-gain-node'
import { familySize } from '../../domain/player'
import type { CardImpl } from '../registry'
import { B6_ExcursiontotheQuarry } from '../../cards-display/B/B6_ExcursiontotheQuarry'

const CARD_ID = B6_ExcursiontotheQuarry.id

export const B6_ExcursiontotheQuarry_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const farmers = familySize(player)
    if (farmers <= 0) return
    return gainLeaf(CARD_ID, { stone: farmers })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
