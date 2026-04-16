import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'E30_ChildsToy'

registerCardEffect({
  id: CARD_ID,
  onBeforeFeed: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    // Remove newborn discount by setting newbornCount to 0
    // This makes newborns cost 2 food like adults
    player.newbornCount = 0
  },
})

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
