import { Occupation } from '../types'

const CARD_ID = 'C112_Thresher'

export const C112_Thresher = new Occupation({
  id: CARD_ID,
  name: 'Thresher',
  deck: 'C',
  number: 112,
  category: 'CROP_PROVIDER',
  desc: [
    'Immediately before each time you use the __Grain Utilization__, __Farmland__, or __Cultivation__ action space, you can buy 1 <GRAIN> for 1 <FOOD>.',
  ],
  cost: {},
  players: '1+',
})
