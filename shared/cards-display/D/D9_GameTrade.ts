import { MinorImprovement } from '../types'

const CARD_ID = 'D9_GameTrade'

export const D9_GameTrade = new MinorImprovement({
  id: CARD_ID,
  name: 'Game Trade',
  deck: 'D',
  number: 9,
  category: 'LIVESTOCK_PROVIDER',
  desc: ['You immediately get 1 <PIG> and 1 <CATTLE>. (effectively, you are exchanging 2 <SHEEP> for 1 <PIG> and 1 <CATTLE>.)'],
  cost: { sheep: 2 },
  passing: true,
})
