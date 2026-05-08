import { Occupation } from '../types'

const CARD_ID = 'E87_MasterRenovator'

export const E87_MasterRenovator = new Occupation({
  id: CARD_ID,
  name: 'Master Renovator',
  deck: 'E',
  number: 87,
  category: 'FARMYARD_-_HOUSE_BUILDING_OR_RENOVATION',
  desc: [
    'At the end of the work phases of rounds 7 and 9, you can take a __Renovation__ action without placing a person and pay 1 building resource of your choice less.',
  ],
  cost: {},
  players: '1+',
})
