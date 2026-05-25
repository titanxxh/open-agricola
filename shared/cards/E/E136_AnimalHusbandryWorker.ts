import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E136_AnimalHusbandryWorker } from '../../cards-display/E/E136_AnimalHusbandryWorker'

const CARD_ID = E136_AnimalHusbandryWorker.id

const roundsLeftWoodBonus = (state: { round: number }): number => {
  const remaining = 14 - state.round
  if (remaining >= 9) return 4
  if (remaining >= 6) return 3
  if (remaining >= 3) return 2
  return 0
}

export const E136_AnimalHusbandryWorker_impl = {
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
    computeBonusScore: (state, player) => {
      const myPastures = player.pastures.length
      const maxPastures = Math.max(...state.players.map((p) => p.pastures.length))
      return myPastures === maxPastures && myPastures > 0 ? 2 : 0
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
