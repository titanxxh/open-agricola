import { MinorImprovement } from '../types'
// BGA: onBuy returns the player's farmer from Grain Utilization action space home.
// This is a special runtime effect that doesn't map to a simple ActionFlow in our engine.
// TODO: implement farmer return-home from specific action space.

export const E3_TeaTime = new MinorImprovement({
  id: 'E3_TeaTime',
  name: 'Tea Time',
  deck: 'E',
  number: 3,
  category: 'ACTION_ENHANCER',
  desc: ['Immediately return your person on the Grain Utilization action space home; you can place it again later this round.'],
  cost: { food: 1 },
  passing: true,
  prerequisite: 'Own Person on Grain Utilization',
})
