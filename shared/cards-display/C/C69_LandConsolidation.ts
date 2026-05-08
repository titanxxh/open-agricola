import { MinorImprovement } from '../types'

const CARD_ID = 'C69_LandConsolidation'

export const C69_LandConsolidation = new MinorImprovement({
  id: CARD_ID,
  name: 'Land Consolidation',
  deck: 'C',
  number: 69,
  category: 'CROP_PROVIDER',
  desc: [
    'At any time, if you have a grain field with exactly 3 sown <GRAIN>, you can exchange the <GRAIN> on the field for 1 <VEGETABLE> on the field.',
  ],
  cost: {},
})
