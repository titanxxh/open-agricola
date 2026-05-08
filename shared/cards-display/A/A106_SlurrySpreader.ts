import { MinorImprovement } from '../types'

const CARD_ID = 'A106_SlurrySpreader'

export const A106_SlurrySpreader = new MinorImprovement({
  id: CARD_ID,
  name: 'Slurry Spreader',
  deck: 'A',
  number: 106,
  category: 'FOOD_PROVIDER',
  desc: ['In the field phase of each harvest, each time you take the last <GRAIN>/<VEGETABLE> from a field, you also get 2 <FOOD>/1 <FOOD>.'],
  cost: {},
  players: '1+',
})
