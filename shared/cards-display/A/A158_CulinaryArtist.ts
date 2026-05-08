import { Occupation } from '../types'

const CARD_ID = 'A158_CulinaryArtist'

export const A158_CulinaryArtist = new Occupation({
  id: CARD_ID,
  name: 'Culinary Artist',
  deck: 'A',
  number: 158,
  category: 'FOOD_PROVIDER',
  desc: [
    'Each time another player uses the __Traveling Players__ accumulation space, you can exchange your choice of 1 <GRAIN>/<SHEEP>/<VEGETABLE> for 4/5/7 <FOOD>.',
  ],
  cost: {},
  players: '4+',
  newSet: true,
})
