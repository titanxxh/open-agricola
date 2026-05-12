import { Occupation } from '../types'

const CARD_ID = 'B101_FurnitureCarpenter'

export const B101_FurnitureCarpenter = new Occupation({
  id: CARD_ID,
  name: 'Furniture Carpenter',
  deck: 'B',
  number: 101,
  category: 'POINTS_PROVIDER',
  desc: ['Each harvest, if any player (including you) owns the Joinery or an upgrade thereof, you can buy exactly 1 bonus <SCORE> for 2 <FOOD>.'],
  cost: {},
  players: '1+',
  extraVp: true,
})
