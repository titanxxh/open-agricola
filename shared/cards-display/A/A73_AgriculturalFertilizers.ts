import { MinorImprovement } from '../types'

const CARD_ID = 'A73_AgriculturalFertilizers'

export const A73_AgriculturalFertilizers = new MinorImprovement({
  id: CARD_ID,
  name: 'Agricultural Fertilizers',
  deck: 'A',
  number: 73,
  category: 'CROP_PROVIDER',
  desc: [
    'Each time after you turn at least 2 unused spaces into used spaces in one action, you get an additional __Sow__ action.',
  ],
  cost: {},
  prerequisite: '1 Pasture',
})
