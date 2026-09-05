import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'B033_Mantlepiece'

const cardImpl = {
  prerequisiteCheck: (player) => player.houseType !== 'wood',
  effect: {
  id: CARD_ID,
  onBuy: (state, _player) => {
    const roundsLeft = Math.max(0, 14 - state.round)
    if (roundsLeft <= 0) return
    // Gain score tokens as food equivalent; TODO: implement bonus-vp leaf for score
    const children = Array.from({ length: roundsLeft }, () => ({
      type: 'leaf' as const,
      actionId: 'bonus-vp',
      sourceCard: CARD_ID,
    }))
    return { type: 'seq' as const, children }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B033_Mantlepiece = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Mantlepiece',
    deck: 'B',
    number: 33,
    category: 'POINTS_PROVIDER',
    desc: ['When you play this card, you immediately get 1 bonus <SCORE> for each complete round left to play. You may no longer renovate your house.'],
    cost: { stone: 1 },
    vp: -3,
    prerequisite: 'Clay or Stone House',
    extraVp: true,
    blocksRenovation: true,
  },
  impl: cardImpl,
})

export const B033_Mantlepiece_impl = B033_Mantlepiece.impl
