import { Occupation } from '../types'

const CARD_ID = 'C164_GermanHeathKeeper'

export const C164_GermanHeathKeeper = new Occupation({
  id: CARD_ID,
  name: 'German Heath Keeper',
  deck: 'C',
  number: 164,
  category: 'LIVESTOCK_PROVIDER',
  desc: [
    'Each time any player (including you) uses the __Pig Market__ accumulation space, you get 1 <SHEEP> from the general supply.',
  ],
  cost: {},
  players: '4+',
  newSet: true,
  implemented: true,
})
