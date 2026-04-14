import { Occupation } from '../types'
// BGA: onBuy checks if player would score max 4 pts in 3+ scoring categories (including fenced stables).
// If so, player can extend their house by 1 room at no cost.
// This requires live scoring computation. Simplified: grant an optional room extension.
// TODO: implement max-score-category check before granting free room extension.

export const E127_DiligentFarmer = new Occupation({
  id: 'E127_DiligentFarmer',
  name: 'Diligent Farmer',
  deck: 'E',
  number: 127,
  category: 'FARM_BUILDER',
  desc: ['When you play this card, if you would score the maximum 4 points in 3 scoring categories (including fenced stables), you can extend your house by 1 room at no cost.'],
  players: '3+',
})
