import { Occupation } from '../types'

const CARD_ID = 'B123_RoofBallaster'

export const B123_RoofBallaster = new Occupation({
  id: CARD_ID,
  name: 'Roof Ballaster',
  deck: 'B',
  number: 123,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['When you play this card, you can immediately pay 1 <FOOD> to get 1 <STONE> for each room you have.'],
  cost: {},
  players: '1+',
})
