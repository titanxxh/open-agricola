import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E136_AnimalHusbandryWorker'
const roundsLeftWoodBonus = (state: { round: number }): number => {
  const remaining = 14 - state.round
  if (remaining >= 9) return 4
  if (remaining >= 6) return 3
  if (remaining >= 3) return 2
  return 0
}

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state) => {
      const wood = roundsLeftWoodBonus(state)
      if (wood <= 0) return
      return {
        type: 'seq' as const,
        children: [
          gainLeaf(CARD_ID, { wood }),
          { type: 'leaf' as const, actionId: 'fence', sourceCard: CARD_ID, optional: true },
        ],
      }
    },
    computeSharedPostScore: (state) => {
      const maxPastures = Math.max(...state.players.map((p) => p.pastures.length))
      return state.players
        .filter((player) => player.pastures.length === maxPastures)
        .map((player) => ({ playerId: player.id, score: 2 }))
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E136_AnimalHusbandryWorker = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Animal Husbandry Worker",
    deck: "E",
    number: 136,
    category: "BONUS_POINTS_-_4_WOOD_CARD_COMPETITION",
    desc: ['If there are still 3/6/9 complete rounds left to play, you immediately get 2/3/4 <WOOD> and a __Build Fences__ action. During scoring, each player with the most pastures gets 2 <SCORE>.'],
    cost: {},
    players: "3+",
    extraVp: true,
  },
  impl: cardImpl,
})

export const E136_AnimalHusbandryWorker_impl = E136_AnimalHusbandryWorker.impl
