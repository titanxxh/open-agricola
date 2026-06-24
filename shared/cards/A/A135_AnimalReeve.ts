import { defineOccupationCard } from '../card-source'
import { animalKeysForState } from '../../contract/animals'
import type { CardImpl } from '../registry'

const CARD_ID = 'A135_AnimalReeve'
const WOOD_MAP: Record<number, number> = {
  0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 2, 6: 3, 7: 3, 8: 3, 9: 4,
}

const SETS_VP_MAP = [0, 0, 1, 3, 5] as const

const cardImpl = {
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
      const sets = Math.min(...animalKeysForState(state).map((animal) => player.resources[animal] ?? 0), 4)
      const score = SETS_VP_MAP[sets] ?? 0
      if (score <= 0) return []
      return [{ playerId: player.id, score }]
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A135_AnimalReeve = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Animal Reeve',
    deck: 'A',
    number: 135,
    category: 'POINTS_PROVIDER',
    desc: ['If there are still 1/3/6/9 complete rounds left to play, you immediately get 1/2/3/4 <WOOD>. During scoring, each player with 2/3/4+ animals of each type gets 1/3/5 bonus <SCORE>.'],
    cost: {},
    players: '3+',
    extraVp: true,
  },
  impl: cardImpl,
})

export const A135_AnimalReeve_impl = A135_AnimalReeve.impl
