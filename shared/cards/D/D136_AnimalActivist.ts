import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D136_AnimalActivist } from '../../cards-display/D/D136_AnimalActivist'
export { D136_AnimalActivist }

const CARD_ID = D136_AnimalActivist.id

const roundsLeftWoodBonus = (state: { round: number }): number => {
  const remaining = 14 - state.round
  if (remaining >= 9) return 4
  if (remaining >= 6) return 3
  if (remaining >= 3) return 2
  return 0
}

export const D136_AnimalActivist_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state) => {
    const wood = roundsLeftWoodBonus(state)
    if (wood <= 0) return
    return gainLeaf(CARD_ID, { wood })
  },
  computeBonusScore: (state, player) => {
    const fencedStables = (p: typeof player) =>
      p.pastures.reduce((sum, past) => sum + past.stables, 0)
    const myCount = fencedStables(player)
    const maxCount = Math.max(...state.players.map(fencedStables))
    return myCount === maxCount && myCount > 0 ? 2 : 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
