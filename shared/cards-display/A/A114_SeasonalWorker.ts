import { Occupation } from '../types'

const CARD_ID = 'A114_SeasonalWorker'

export const A114_SeasonalWorker = new Occupation({
  id: CARD_ID,
  name: 'Seasonal Worker',
  deck: 'A',
  number: 114,
  category: 'CROP_PROVIDER',
  desc: ['Each time you use the __Day Laborer__ action space, you get 1 additional <GRAIN>. From round 6 on, you can choose to get 1 <VEGETABLE> instead.'],
  cost: {},
  players: '1+',
})
