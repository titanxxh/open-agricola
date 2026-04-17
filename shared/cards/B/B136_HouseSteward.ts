import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'B136_HouseSteward'

const WOOD_MAP: Record<number, number> = {
  0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 2, 6: 3, 7: 3, 8: 3, 9: 4,
}

registerCardEffect({
  id: CARD_ID,
  onBuy: (state) => {
    const remainingTurns = 14 - state.round
    const toGain = remainingTurns >= 9 ? 4 : (WOOD_MAP[remainingTurns] ?? 0)
    if (toGain <= 0) return
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { wood: toGain },
    }
  },
  computeSharedPostScore: (state) => {
    const maxRooms = Math.max(...state.players.map((player) => player.rooms))
    return state.players
      .filter((player) => player.rooms === maxRooms)
      .map((player) => ({ playerId: player.id, score: 3 }))
  },
})

export const B136_HouseSteward = new Occupation({
  id: CARD_ID,
  name: "House Steward",
  deck: "B",
  number: 136,
  category: "POINTS_PROVIDER",
  desc: ["If there are still 1/3/6/9 complete rounds left to play, you immediately get 1/2/3/4 <WOOD>. During scoring, each player with the most rooms gets 3 bonus <SCORE>."],
  cost: {},
  players: "3+",
  extraVp: true,
})
