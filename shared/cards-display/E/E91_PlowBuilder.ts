import { Occupation } from '../types'

const CARD_ID = 'E91_PlowBuilder'

export const E91_PlowBuilder = new Occupation({
  id: CARD_ID,
  name: 'Plow Builder',
  deck: 'E',
  number: 91,
  desc: ['You can build the Joinery when taking a __Minor Improvement__ action. If you use the Joinery (or an upgrade thereof) during the harvest, you can pay 1 <FOOD> to plow 1 field.'],
  cost: {},
  players: '1+',
})
