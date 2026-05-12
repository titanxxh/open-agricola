import { Occupation } from '../types'

const CARD_ID = 'E103_Wolf'

export const E103_Wolf = new Occupation({
  id: CARD_ID,
  name: 'Wolf',
  deck: 'E',
  number: 103,
  desc: [
    'Pile (from bottom to top) 1 <CLAY>, 1 <WOOD>, and 1 <GRAIN> on this card. Each time you get a good matching the top item, you can move that item to your supply and get 1 <PIG>.',
  ],
  cost: {},
  players: '1+',
  category: 'GOODS_-_GET',
})
