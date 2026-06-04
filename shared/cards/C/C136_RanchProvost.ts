import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'
import { playerBoard } from '../../domain'

const CARD_ID = 'C136_RanchProvost'
const woodMap: Record<number, number> = {
  0: 0, 1: 0, 2: 0, 3: 2, 4: 2, 5: 2, 6: 3, 7: 3, 8: 3, 9: 4,
}

const cardImpl = {
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

export const C136_RanchProvost = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Ranch Provost",
    deck: "C",
    number: 136,
    category: "POINTS_PROVIDER",
    desc: ["If there are still 3/6/9 complete rounds left to play, you immediately get 2/3/4 <WOOD>. During scoring, each player with a pasture of highest capacity gets 3 bonus <SCORE>."],
    players: "3+",
    extraVp: true,
  },
  impl: cardImpl,
})

export const C136_RanchProvost_impl = C136_RanchProvost.impl
