import { MinorImprovement } from '../types'

const CARD_ID = 'E36_HerbalGarden'

export const E36_HerbalGarden = new MinorImprovement({
  id: CARD_ID,
  name: 'Herbal Garden',
  deck: 'E',
  number: 36,
  category: 'BONUS_POINTS_-_GET',
  desc: ['From now on, at least one of your pastures must contain no animals.'],
  cost: { wood: 1 },
  vp: 2,
  prerequisite: '1 Pasture',
})
