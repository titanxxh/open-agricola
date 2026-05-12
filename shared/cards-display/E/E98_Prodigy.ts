import { Occupation } from '../types'

const CARD_ID = 'E98_Prodigy'

export const E98_Prodigy = new Occupation({
  id: CARD_ID,
  name: 'Prodigy',
  deck: 'E',
  number: 98,
  category: 'BONUS_POINTS_-_GET',
  desc: ['If this is your 1st occupation, you immediately get 1 <SCORE> for each improvement you have. (This will not apply to improvements played after this card.)'],
  players: '1+',
  extraVp: true,
})
