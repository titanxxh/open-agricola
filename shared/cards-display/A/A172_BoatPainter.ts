import { Occupation } from '../types'

export const A172_BoatPainter = new Occupation({
  id: 'A172_BoatPainter',
  name: 'Boat Painter',
  deck: 'A',
  number: 172,
  category: 'FOOD_PROVIDER',
  desc: ['At the end of each work phase, if both the "Fishing" and "Traveling Players" accumulation spaces are occupied, you get your choice of 1 grain or 2 food.'],
  cost: {},
  players: '5+',
})
