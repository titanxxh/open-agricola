import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { countOccupations } from '../../helpers/prerequisites'

const CARD_ID = 'CWM059_Apprenticeship'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) =>
      state.players.every(
        (p) => p.id === player.id || countOccupations(p) > countOccupations(player),
      )
        ? {
            type: 'leaf',
            actionId: 'occupation',
            sourceCard: CARD_ID,
            params: { exactCost: {} },
            optional: true,
          }
        : undefined,
  },
} satisfies CardImpl

export const CWM059_Apprenticeship = defineMinorCard({
  meta: {
    id: 'CWM059_Apprenticeship',
    name: "Apprenticeship",
    deck: 'CWM',
    number: 59,
    desc: ["If you have fewer occupations than every other player, you may immediately play one occupation for free. Afterwards, pass this card to the next player, who adds it to their hand."],
    cost: {
      food: 1,
    },
    vp: 0,
    prerequisite: "",
    passing: true,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM059.png',
  },
  impl: cardImpl,
})

export const CWM059_Apprenticeship_impl = CWM059_Apprenticeship.impl
