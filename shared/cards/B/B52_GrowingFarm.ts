import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B52_GrowingFarm } from '../../cards-display/B/B52_GrowingFarm'

const CARD_ID = B52_GrowingFarm.id

export const B52_GrowingFarm_impl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, _player) => {
      const turn = state.round
      if (turn <= 0) return
      return gainLeaf(CARD_ID, { food: turn })
    },
  },
  prerequisiteCheck: (player, state) => {
    if (!state) return true
    const coveredZones = player.pastures.reduce((sum, p) => sum + p.tiles.length, 0)
    return coveredZones >= state.round - 1
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
