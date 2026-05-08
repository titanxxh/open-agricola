import { MinorImprovement } from '../types'

const CARD_ID = 'D71_Changeover'

export const D71_Changeover = new MinorImprovement({
  id: CARD_ID,
  name: 'Changeover',
  deck: 'D',
  number: 71,
  category: 'CROP_PROVIDER',
  desc: ['At any time, if a field contains exactly 1 good as a result of a harvest, you can discard that good and immediately take a __Sow__ action limited to that field.'],
  cost: {},
  newSet: true,
})
