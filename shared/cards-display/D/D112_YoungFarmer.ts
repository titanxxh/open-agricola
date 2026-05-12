import { Occupation } from '../types'

const CARD_ID = 'D112_YoungFarmer'

export const D112_YoungFarmer = new Occupation({
  id: CARD_ID,
  name: 'Young Farmer',
  deck: 'D',
  number: 112,
  category: 'CROP_PROVIDER',
  desc: [
    'Each time you use the __Major Improvement__ action space, you also get 1 <GRAIN> and, afterward, you can take a __Sow__ action.',
  ],
  cost: {},
  players: '1+',
})
