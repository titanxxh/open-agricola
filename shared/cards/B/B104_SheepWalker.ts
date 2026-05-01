import { Occupation } from '../types'

const CARD_ID = 'B104_SheepWalker'

// Note: The original BGA card conditionally hides exchanges when animals are in the "reserve"
// (i.e., pending animal reorganization). Our exchange system does not support conditional
// exchange availability, so these exchanges are always visible when the card is played.
// TODO: Enforce that the sheep must be accommodated on the farmyard before being exchanged.

export const B104_SheepWalker = new Occupation({
  id: CARD_ID,
  name: 'Sheep Walker',
  deck: 'B',
  number: 104,
  category: 'GOODS_PROVIDER',
  desc: [
    'At any time, you can exchange 1 <SHEEP> on your farmyard for either 1 <PIG>, 1 <VEGETABLE>, or 1 <STONE>.',
  ],
  cost: {},
  players: '1+',
  exchanges: [
    { from: { sheep: 1 }, to: { boar: 1 }, triggers: ['anytime'] },
    { from: { sheep: 1 }, to: { vegetable: 1 }, triggers: ['anytime'] },
    { from: { sheep: 1 }, to: { stone: 1 }, triggers: ['anytime'] },
  ],
})
