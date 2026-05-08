import { Occupation } from '../types'

const CARD_ID = 'E166_Roastmaster'

export const E166_Roastmaster = new Occupation({
  id: CARD_ID,
  name: 'Roastmaster',
  deck: 'E',
  number: 166,
  category: 'ANIMALS_-_CATTLE',
  desc: ['Each time you use the __Traveling Players__ or __Fishing__ accumulation spaces, you can move exactly 1 <FOOD> from that space to the other to get 1 <CATTLE>.'],
  cost: {},
  players: '4+',
})
