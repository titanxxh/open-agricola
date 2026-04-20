import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

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

export const A9_YoungAnimalMarket_impl = {
  effect: {
  id: CARD_ID,
  onBuy: () => ({
    type: 'leaf' as const,
    actionId: 'gain',
    sourceCard: CARD_ID,
    params: { cattle: 1 },
  }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
