import { Occupation } from '../types'

const CARD_ID = 'E102_Acquirer'

export const E102_Acquirer = new Occupation({
  id: CARD_ID,
  name: 'Acquirer',
  deck: 'E',
  number: 102,
  category: 'GOODS_-_GET',
  desc: ['At the start of each round, you can pay <FOOD> equal to the number of people you have to buy 1 good of your choice from the general supply.'],
  cost: {},
  players: '1+',
})
