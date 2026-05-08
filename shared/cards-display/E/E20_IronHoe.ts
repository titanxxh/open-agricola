import { MinorImprovement } from '../types'

const CARD_ID = 'E20_IronHoe'

export const E20_IronHoe = new MinorImprovement({
  id: CARD_ID,
  name: 'Iron Hoe',
  deck: 'E',
  number: 20,
  category: 'FARMYARD_-_PLOWING',
  desc: ['At the end of each work phase, if you occupy both the __Grain Seeds__ and __Vegetable Seeds__ action spaces, you can plow 1 field.'],
  cost: { wood: 1 },
})
