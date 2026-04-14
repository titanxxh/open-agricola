import { MinorImprovement } from '../types'
// BGA: onBuy uses SPECIAL_EFFECT argsSelectResources — player picks 2 different building resources
// from accumulation spaces. Too complex for current engine (requires querying accumulation meeples).
// TODO: implement accumulation space resource selection.

export const E5_NightLoot = new MinorImprovement({
  id: 'E5_NightLoot',
  name: 'Night Loot',
  deck: 'E',
  number: 5,
  category: 'RESOURCE_WOOD',
  desc: ['Immediately remove 2 different building resources total from accumulation spaces and place them in your supply.'],
  cost: { food: 2 },
  passing: true,
})
