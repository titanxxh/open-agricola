import { Occupation } from '../types'

const CARD_ID = 'A167_BreederBuyer'

export const A167_BreederBuyer = new Occupation({
  id: CARD_ID,
  name: 'Breeder Buyer',
  deck: 'A',
  number: 167,
  category: 'LIVESTOCK_PROVIDER',
  desc: [
    'Each time you build at least 1 wood/clay/stone room and at least 1 stable on the same turn, you also get 1 <SHEEP>/<PIG>/<CATTLE>.',
  ],
  cost: {},
  players: '4+',
  evenMoreSet: true,
})
