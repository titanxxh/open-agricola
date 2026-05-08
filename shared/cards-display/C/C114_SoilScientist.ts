import { Occupation } from '../types'

const CARD_ID = 'C114_SoilScientist'

export const C114_SoilScientist = new Occupation({
  id: CARD_ID,
  name: 'Soil Scientist',
  deck: 'C',
  number: 114,
  category: 'CROP_PROVIDER',
  desc: [
    'Each time after you use a clay/stone accumulation space, you can place 1 <STONE>/2 <CLAY> from your supply on the space to get 2 <GRAIN>/1 <VEGETABLE>, respectively.',
  ],
  cost: {},
  players: '1+',
  newSet: true,
})
