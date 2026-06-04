import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B52_GrowingFarm'

const cardImpl = {
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

export const B52_GrowingFarm = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Growing Farm',
    deck: 'B',
    number: 52,
    category: 'FOOD_PROVIDER',
    desc: ['You can only play this card if you have at least as many pasture spaces as the number of completed rounds. If you do, you get a number of <FOOD> equal to the current round.'],
    cost: { clay: 2, reed: 1 },
    vp: 2,
    prerequisite: 'see below',
  },
  impl: cardImpl,
})

export const B52_GrowingFarm_impl = B52_GrowingFarm.impl
