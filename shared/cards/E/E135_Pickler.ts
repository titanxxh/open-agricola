import { gainLeaf } from '../helpers/pay-gain-node'
import { fieldHasCrop, fieldFindStackOfKind } from '../../domain/field'
import type { CardImpl } from '../registry'
import { E135_Pickler } from '../../cards-display/E/E135_Pickler'

const CARD_ID = E135_Pickler.id

const roundsLeftWoodBonus = (state: { round: number }): number => {
  const remaining = 14 - state.round
  if (remaining >= 9) return 4
  if (remaining >= 6) return 3
  if (remaining >= 3) return 2
  if (remaining >= 1) return 1
  return 0
}

export const E135_Pickler_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state) => {
    const wood = roundsLeftWoodBonus(state)
    if (wood <= 0) return
    return gainLeaf(CARD_ID, { wood })
  },
  computeBonusScore: (state, player) => {
    const totalVeg = (p: typeof player) =>
      (p.resources.vegetable ?? 0) + p.fields
        .filter((f) => fieldHasCrop(f, 'vegetable'))
        .reduce((sum, f) => sum + (fieldFindStackOfKind(f, 'vegetable')?.remaining ?? 0), 0)
    const myVeg = totalVeg(player)
    const maxVeg = Math.max(...state.players.map(totalVeg))
    return myVeg === maxVeg && myVeg > 0 ? 3 : 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
