import { Occupation } from '../types'

const CARD_ID = 'E94_Prophet'

export const E94_Prophet = new Occupation({
  id: CARD_ID,
  name: 'Prophet',
  deck: 'E',
  number: 94,
  category: 'ACTION',
  desc: ['When you play this card, immediately take a __Renovation__ action. Afterward, you can take a __Build Fences__ action. (Both actions require their usual cost.)'],
  players: '1+',
})
