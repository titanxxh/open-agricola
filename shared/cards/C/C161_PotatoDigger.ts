import { defineOccupationCard } from '../card-source'
import { fieldIsEmpty } from '../../domain/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'C161_PotatoDigger'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const emptyFields = player.fields.filter((f) => fieldIsEmpty(f)).length
    let n = 0
    if (emptyFields >= 2) n = 1
    if (emptyFields >= 4) n = 2
    if (emptyFields >= 5) n = 3
    if (n === 0) return
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { vegetable: n },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C161_PotatoDigger = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Potato Digger",
    deck: "C",
    number: 161,
    category: "CROP_PROVIDER",
    desc: ["When you play this card, if you have at least 2/4/5 unplanted <FIELD> tiles, you immediately get 1/2/3 <VEGETABLE>."],
    players: "4+",
  },
  impl: cardImpl,
})

export const C161_PotatoDigger_impl = C161_PotatoDigger.impl
