import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'B33_Mantlepiece'

// BGA: gain 1 bonus score per complete round remaining (14 - turn). vp: -3, extraVp: true.
// Note: ignoring the "may no longer renovate" restriction for now (TODO: hook to block renovation).
registerCardEffect({
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
})

export const B33_Mantlepiece = new MinorImprovement({
  id: CARD_ID,
  name: 'Mantlepiece',
  deck: 'B',
  number: 33,
  category: 'POINTS_PROVIDER',
  desc: ['When you play this card, you immediately get 1 bonus <SCORE> for each complete round left to play. You may no longer renovate your house.'],
  cost: { stone: 1 },
  vp: -3,
  prerequisite: 'Clay or Stone House',
})
