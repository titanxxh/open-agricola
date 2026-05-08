import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C165_GameCatcher } from '../../cards-display/C/C165_GameCatcher'
export { C165_GameCatcher }

const CARD_ID = C165_GameCatcher.id

const harvestRounds = [4, 7, 9, 11, 13, 14]

export const C165_GameCatcher_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, _player) => {
    const remainingHarvests = harvestRounds.filter((r) => r >= state.round).length
    if (remainingHarvests === 0) {
      return gainLeaf(CARD_ID, { cattle: 1, boar: 1 })
    }
    return {
      type: 'seq' as const,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { food: remainingHarvests } }),
        gainLeaf(CARD_ID, { cattle: 1, boar: 1 }),
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
