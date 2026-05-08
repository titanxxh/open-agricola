import { Occupation } from '../types'

const CARD_ID = 'E168_AnimalTamersApprentice'

export const E168_AnimalTamersApprentice = new Occupation({
  id: CARD_ID,
  name: "Animal Tamer's Apprentice",
  deck: 'E',
  number: 168,
  category: 'ANIMALS_-_ALL',
  desc: ['At the start of each round, you get 1 <SHEEP>/<PIG>/<CATTLE> for each unoccupied wood/clay/stone room in your house.'],
  cost: {},
  players: '4+',
})
