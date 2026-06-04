import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'A9_YoungAnimalMarket'

const cardImpl = {
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

export const A9_YoungAnimalMarket = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Young Animal Market',
    deck: 'A',
    number: 9,
    category: 'LIVESTOCK_PROVIDER',
    desc: ['You immediately get 1 <CATTLE>. (Effectively, you are exchanging 1 <SHEEP> for 1 <CATTLE>.)'],
    cost: { sheep: 1 },
    passing: true,
  },
  impl: cardImpl,
})

export const A9_YoungAnimalMarket_impl = A9_YoungAnimalMarket.impl
