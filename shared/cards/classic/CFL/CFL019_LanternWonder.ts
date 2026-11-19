import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CFL019_LanternWonder'

const cardImpl = {
  prerequisiteCheck: (player) => (player.discardedHandCardCount ?? 0) === 0,
  effect: {
    id: CARD_ID,
    computeBonusScore: (_state, player) =>
      -(player.minorHand.length + player.occupationHand.length),
  },
} satisfies CardImpl

export const CFL019_LanternWonder = defineMinorCard({
  meta: {
    id: 'CFL019_LanternWonder',
    name: 'Lantern Wonder',
    deck: 'CFL',
    number: 19,
    vp: 8,
    occupationPrerequisites: {
      max: 0,
    },
    desc: [
      'During scoring, you lose 1 point for each card left in your hand. You cannot discard unplayed hand cards. If you have already discarded any, you cannot play this card.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL019.png',
    preventsHandDiscard: true,
    prerequisite: 'No occupation; no hand cards previously discarded',
  },
  impl: cardImpl,
})
