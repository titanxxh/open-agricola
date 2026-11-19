import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CWM038_Minimalist'

const cardImpl = {
  effect: {
    id: CARD_ID,
    computeBonusScore: (_state, player) =>
      [9, 6, 4, 2][new Set([...player.minorPlayed, ...player.improvements]).size] ?? 0,
  },
} satisfies CardImpl

export const CWM038_Minimalist = defineOccupationCard({
  meta: {
    id: 'CWM038_Minimalist',
    name: "Minimalist",
    deck: 'CWM',
    number: 38,
    desc: ["At the end of the game, get 9, 6, 4, or 2 bonus points if you have exactly 0, 1, 2, or 3 improvements in front of you, respectively."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '3+',
    passing: false,
    extraVp: true,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM038.png',
  },
  impl: cardImpl,
})

export const CWM038_Minimalist_impl = CWM038_Minimalist.impl
