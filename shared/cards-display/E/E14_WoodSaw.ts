import { MinorImprovement } from '../types'

const CARD_ID = 'E14_WoodSaw'

export const E14_WoodSaw = new MinorImprovement({
  id: CARD_ID,
  name: 'Wood Saw',
  deck: 'E',
  number: 14,
  category: 'FARMYARD_-_HOUSE_BUILDING_OR_RENOVATION',
  desc: ['Each time all other players have more people than you, you can take a __Build Rooms__ action without placing a person.'],
  cost: { wood: 1 },
})
