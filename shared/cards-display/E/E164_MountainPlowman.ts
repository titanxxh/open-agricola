import { Occupation } from '../types'

const CARD_ID = 'E164_MountainPlowman'

export const E164_MountainPlowman = new Occupation({
  id: CARD_ID,
  name: 'Mountain Plowman',
  deck: 'E',
  number: 164,
  category: 'ANIMALS_-_SHEEP',
  desc: ['Each time you plow at least 1 field, you get 1 <SHEEP> for each field that you just plowed.'],
  cost: {},
  players: '4+',
})
