import { Occupation } from '../types'

const CARD_ID = 'B102_Consultant'

export const B102_Consultant = new Occupation({
  id: CARD_ID,
  name: 'Consultant',
  deck: 'B',
  number: 102,
  category: 'GOODS_PROVIDER',
  desc: ['When you play this card in a 1-/2-/3-/4- player game, you immediately get 2 <GRAIN>/3 <CLAY>/2 <REED>/2 <SHEEP>.'],
  cost: {},
  players: '1+',
})
