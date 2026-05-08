import { Occupation } from '../types'

const CARD_ID = 'E138_LivestockExpert'

export const E138_LivestockExpert = new Occupation({
  id: CARD_ID,
  name: 'Livestock Expert',
  deck: 'E',
  number: 138,
  category: 'GOODS_-_GET',
  desc: ['If you play this card in round 11 or before, choose an animal type: you immediately get a number of animals of that type equal to the number you already have on your farm.'],
  players: '3+',
})
