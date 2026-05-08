import { MinorImprovement } from '../types'

const CARD_ID = 'A9_YoungAnimalMarket'

export const A9_YoungAnimalMarket = new MinorImprovement({
  id: CARD_ID,
  name: 'Young Animal Market',
  deck: 'A',
  number: 9,
  category: 'LIVESTOCK_PROVIDER',
  desc: ['You immediately get 1 <CATTLE>. (Effectively, you are exchanging 1 <SHEEP> for 1 <CATTLE>.)'],
  cost: { sheep: 1 },
  passing: true,
})
