import { Occupation } from '../types'

const CARD_ID = 'B164_SheepWhisperer'

export const B164_SheepWhisperer = new Occupation({
  id: CARD_ID,
  name: 'Sheep Whisperer',
  deck: 'B',
  number: 164,
  category: 'LIVESTOCK_PROVIDER',
  desc: ['Add 2, 5, 8, and 10 to the current round and place 1 <SHEEP> on each corresponding round space. At the start of these rounds, you get the <SHEEP>.'],
  cost: {},
  players: '4+',
})
