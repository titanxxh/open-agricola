import { MinorImprovement } from '../types'

const CARD_ID = 'E30_ChildsToy'

export const E30_ChildsToy = new MinorImprovement({
  id: CARD_ID,
  name: "Child's Toy",
  deck: 'E',
  number: 30,
  category: 'BONUS_POINTS_-_GET',
  desc: ['During the feeding phase of each harvest, your newborns require 2 <FOOD> (instead of 1).'],
  cost: { wood: 1 },
  altCosts: [{ clay: 1 }],
  vp: 2,
  prerequisite: 'Exactly 2 Adults',
})
