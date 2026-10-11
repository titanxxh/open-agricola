import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { collectCardsAs } from '../helpers/card-type'
import type { CardImpl } from '../registry'

const CARD_ID = 'E157_Usufructuary'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      if (collectCardsAs(player, 'occupation').length !== 1) return
      const otherOccupations = state.players
        .filter((other) => other.id !== player.id)
        .reduce((sum, other) => sum + collectCardsAs(other, 'occupation').length, 0)
      if (otherOccupations <= 0) return
      return gainLeaf(CARD_ID, { food: Math.min(7, otherOccupations) })
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E157_Usufructuary = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Usufructuary',
    deck: 'E',
    number: 157,
    category: 'FOOD',
    desc: [
        'When you play this card as your first occupation, you immediately get 1 <FOOD> for every other occupation in play (by any player), up to a maximum of 7 <FOOD>.',
      ],
    cost: {},
    players: '4+',
  },
  impl: cardImpl,
})

export const E157_Usufructuary_impl = E157_Usufructuary.impl
