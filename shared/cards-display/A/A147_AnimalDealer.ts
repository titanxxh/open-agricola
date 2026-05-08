import { Occupation } from '../types'

const CARD_ID = 'A147_AnimalDealer'

export const A147_AnimalDealer = new Occupation({
  id: CARD_ID,
  name: 'Animal Dealer',
  deck: 'A',
  number: 147,
  category: 'LIVESTOCK_PROVIDER',
  desc: ['Each time you use the __Sheep Market__, __Pig Market__, or __Cattle Market__ accumulation space, you can buy 1 additional animal of the respective type for 1 <FOOD>.'],
  cost: {},
  players: '3+',
})
