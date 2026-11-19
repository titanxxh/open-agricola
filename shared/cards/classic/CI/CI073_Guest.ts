import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { grantGuestLeaf } from '../../helpers/guest-flow'

const CARD_ID = 'CI073_Guest'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state) => {
      // The Guest is for the next round, so the last round has none to give.
      if (state.round >= 14) return
      return grantGuestLeaf(CARD_ID, { round: state.round + 1 })
    },
  },
} satisfies CardImpl

export const CI073_Guest = defineMinorCard({
  meta: {
    id: 'CI073_Guest',
    name: 'Guest',
    deck: 'CI',
    number: 73,
    desc: [
      'When you play this card, you receive a guest token, which you may place once in the next round as you would a person. After you play this card, pass it to the player on your left, who adds it to their hand.',
    ],
    cost: {
      food: 2,
    },
    passing: true,
    extraVp: false,
    implemented: true,
  },
  impl: cardImpl,
})
export const CI073_Guest_impl = CI073_Guest.impl
