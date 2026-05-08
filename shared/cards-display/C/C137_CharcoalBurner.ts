import { Occupation } from '../types'

const CARD_ID = 'C137_CharcoalBurner'

export const C137_CharcoalBurner = new Occupation({
  id: CARD_ID,
  name: 'Charcoal Burner',
  deck: 'C',
  number: 137,
  category: 'GOODS_PROVIDER',
  desc: [
    'Each time any player (including you) plays or builds a <BAKE>-improvement, you get 1 <WOOD> and 1 <FOOD>.',
  ],
  cost: {},
  players: '3+',
  newSet: true,
})
