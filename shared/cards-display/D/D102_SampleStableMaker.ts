import { Occupation } from '../types'

const CARD_ID = 'D102_SampleStableMaker'

export const D102_SampleStableMaker = new Occupation({
  id: CARD_ID,
  name: 'Sample Stable Maker',
  deck: 'D',
  number: 102,
  category: 'GOODS_PROVIDER',
  desc: [
    'At the start of each returning home phase, you can return a built stable to your supply to get 1 <WOOD>, 1 <GRAIN>, 1 <FOOD>, and a __Minor Improvement__ action.',
  ],
  cost: {},
  players: '1+',
})
