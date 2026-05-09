import type { CardImpl } from '../registry'
import { playerBoard } from '../../domain'
import { C136_RanchProvost } from '../../cards-display/C/C136_RanchProvost'

const CARD_ID = C136_RanchProvost.id

const woodMap: Record<number, number> = {
  0: 0, 1: 0, 2: 0, 3: 2, 4: 2, 5: 2, 6: 3, 7: 3, 8: 3, 9: 4,
}

export const C136_RanchProvost_impl = {
  effect: {
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
  computeSharedPostScore: (state) => {
    const bestPerPlayer = state.players.map((_player, idx) => {
      const zones = playerBoard(state, idx).animals.zones()
      const pastureCaps = zones.filter((z) => z.zoneType === 'pasture').map((z) => z.capacity)
      return pastureCaps.length > 0 ? Math.max(...pastureCaps) : 0
    })
    const max = Math.max(...bestPerPlayer)
    if (max <= 0) return []
    return state.players.flatMap((player, idx) =>
      bestPerPlayer[idx] === max ? [{ playerId: player.id, score: 3 }] : [],
    )
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
