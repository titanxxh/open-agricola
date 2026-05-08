import type { CardImpl } from '../registry'
import { B136_HouseSteward } from '../../cards-display/B/B136_HouseSteward'
export { B136_HouseSteward }

const CARD_ID = B136_HouseSteward.id

const WOOD_MAP: Record<number, number> = {
  0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 2, 6: 3, 7: 3, 8: 3, 9: 4,
}

export const B136_HouseSteward_impl = {
  effect: {
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
},
  reaches: [] as readonly string[],
} satisfies CardImpl
