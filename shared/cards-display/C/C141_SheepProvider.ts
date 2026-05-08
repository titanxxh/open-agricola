import { Occupation } from '../types'

const CARD_ID = 'C141_SheepProvider'

export const C141_SheepProvider = new Occupation({
  id: CARD_ID,
  name: "Sheep Provider",
  deck: "C",
  number: 141,
  category: "CROP_PROVIDER",
  desc: [
    'Each time any player (including you) uses the __Sheep Market__ accumulation space, you get 1 <GRAIN>.',
  ],
  cost: {},
  players: "3+",
})
