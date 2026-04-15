import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'C136_RanchProvost'

const woodMap: Record<number, number> = {
  0: 0, 1: 0, 2: 0, 3: 2, 4: 2, 5: 2, 6: 3, 7: 3, 8: 3, 9: 4,
}

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, _player) => {
    const remainingTurns = 14 - state.round
    const toGain = woodMap[remainingTurns] ?? 4
    if (toGain === 0) return
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { wood: toGain },
    }
  },
  // TODO: computeBonusScore: each player with a pasture of highest capacity gets 3 bonus score.
  // This requires checking all players' pastures, which is a shared scoring effect.
})

export const C136_RanchProvost = new Occupation({
  id: CARD_ID,
  name: "Ranch Provost",
  deck: "C",
  number: 136,
  category: "POINTS_PROVIDER",
  desc: ["If there are still 3/6/9 complete rounds left to play, you immediately get 2/3/4 <WOOD>. During scoring, each player with a pasture of highest capacity gets 3 bonus <SCORE>."],
  players: "3+",
  newSet: true,
})
