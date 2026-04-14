import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/future-meeples'

const CARD_ID = 'C65_Granary'

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    const targetRounds = [8, 10, 12].filter((r) => r > state.round)
    if (targetRounds.length === 0) return
    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: targetRounds.map((round) => ({ round, resources: { grain: 1 } })),
    })
    return futureMeeplesNode()
  },
})

export const C65_Granary = new MinorImprovement({
  id: CARD_ID,
  name: "Granary",
  deck: "C",
  number: 65,
  category: "CROP_PROVIDER",
  desc: ["Place 1 <GRAIN> each on the remaining spaces for rounds 8, 10, and 12. At the start of these rounds, you get the <GRAIN>. Worth 1 bonus <SCORE>."],
  vp: 1,
  altCosts: [{ wood: 3 }, { clay: 3 }],
})
