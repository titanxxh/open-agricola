import type { CardImpl } from '../registry'
import { A135_AnimalReeve } from '../../cards-display/A/A135_AnimalReeve'

const CARD_ID = A135_AnimalReeve.id

const WOOD_MAP: Record<number, number> = {
  0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 2, 6: 3, 7: 3, 8: 3, 9: 4,
}

const SETS_VP_MAP = [0, 0, 1, 3, 5] as const

export const A135_AnimalReeve_impl = {
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
    return state.players.flatMap((player) => {
      const sets = Math.min(
        player.resources.sheep,
        player.resources.boar,
        player.resources.cattle,
        4,
      )
      const score = SETS_VP_MAP[sets] ?? 0
      if (score <= 0) return []
      return [{ playerId: player.id, score }]
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
