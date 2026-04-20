import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E30_ChildsToy'

export const E30_ChildsToy = new MinorImprovement({
  id: CARD_ID,
  name: "Child's Toy",
  deck: 'E',
  number: 30,
  category: 'POINTS_PROVIDER',
  desc: ['During the feeding phase of each harvest, your newborns require 2 <FOOD> (instead of 1).'],
  cost: { wood: 1 },
  altCosts: [{ clay: 1 }],
  vp: 2,
  prerequisite: 'Exactly 2 Adults',
})

export const E30_ChildsToy_impl = {
  effect: {
  id: CARD_ID,
  onBeforeFeed: (_state, player) => {
    // Remove newborn discount by treating newborns as adults
    // This makes newborns cost 2 food like adults
    for (const w of player.workers) {
      if (w.isActive) w.isNewborn = false
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
