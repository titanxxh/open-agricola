import { Occupation } from '../types'

const CARD_ID = 'D168_Stockman'

export const D168_Stockman = new Occupation({
  id: CARD_ID,
  name: 'Stockman',
  deck: 'D',
  number: 168,
  category: 'LIVESTOCK_PROVIDER',
  desc: [
    'When you build your 2nd/3rd/4th stable, you immediately get 1 <CATTLE>/<PIG>/<SHEEP>, even if built on the same turn (but not retroactively).',
  ],
  cost: {},
  players: '4+',
})
