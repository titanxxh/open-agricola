import { MinorImprovement } from '../types'
// BGA: onBuy triggers a UI notification that harvest costs have changed.
// The actual effect (newborns cost 2 food instead of 1 during feeding) is handled
// in the feeding phase logic. No ActionFlow needed for onBuy.
// TODO: implement newborn feeding cost modifier in harvest feeding phase.

export const E30_ChildsToy = new MinorImprovement({
  id: "E30_ChildsToy",
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
