import { MinorImprovement } from '../types'

const CARD_ID = 'C73_SeaweedFertilizer'

export const C73_SeaweedFertilizer = new MinorImprovement({
  id: CARD_ID,
  name: 'Seaweed Fertilizer',
  deck: 'C',
  number: 73,
  category: 'CROP_PROVIDER',
  desc: [
    'Each time after you take an unconditional __Sow__ action, you get 1 <GRAIN> from the general supply. From round 11 on, you can get 1 <VEGETABLE> instead.',
  ],
  cost: { food: 2 },
})
