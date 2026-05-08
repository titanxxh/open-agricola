import { gainLeaf } from '../helpers/pay-gain-node'
import { isSpaceOccupied } from '../../domain/space'
import type { CardImpl } from '../registry'
import { A157_Bohemian } from '../../cards-display/A/A157_Bohemian'
export { A157_Bohemian }

const CARD_ID = A157_Bohemian.id

const LESSONS_SPACES = ['lessons', 'lessons-4']

export const A157_Bohemian_impl = {
  effect: {
  id: CARD_ID,
  onStartReturnHome: (state, _player) => {
    // At least one lessons space must be unoccupied
    const anyUnoccupied = LESSONS_SPACES.some(
      (id) => {
        const space = state.actionSpaces.find((s) => s.id === id)
        return !!space && !isSpaceOccupied(space)
      },
    )
    if (!anyUnoccupied) return
    return gainLeaf(CARD_ID, { food: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
