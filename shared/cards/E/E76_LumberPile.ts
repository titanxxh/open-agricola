import { MinorImprovement } from '../types'
// BGA: onBuy uses SPECIAL_EFFECT argsReturnStables — player can return up to 3 stables
// from their farmyard and gain 3 wood each. Complex stable-return UI not available.
// TODO: implement optional stable return (up to 3 stables → 3 wood each).

export const E76_LumberPile = new MinorImprovement({
  id: 'E76_LumberPile',
  name: 'Lumber Pile',
  deck: 'E',
  number: 76,
  category: 'RESOURCE_WOOD',
  desc: ['When you play this card, you can immediately return up to 3 <STABLE> from your farmyard board to your supply and get 3 <WOOD> for each.'],
})
