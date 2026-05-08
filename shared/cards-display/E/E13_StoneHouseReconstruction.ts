import { MinorImprovement } from '../types'

const CARD_ID = 'E13_StoneHouseReconstruction'

export const E13_StoneHouseReconstruction = new MinorImprovement({
  id: CARD_ID,
  name: 'Stone House Reconstruction',
  deck: 'E',
  number: 13,
  category: 'FARMYARD_-_HOUSE_BUILDING_OR_RENOVATION',
  desc: ['At any time, you can renovate your clay house to a stone house without placing a person. (You must pay the normal renovation cost.)'],
  cost: { stone: 1 },
  vp: 1,
})
