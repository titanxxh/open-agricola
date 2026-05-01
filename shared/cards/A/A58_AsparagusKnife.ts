import { MinorImprovement } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow } from '../../game/types'
import { registerSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import { fieldTopStack, fieldDecrementTop } from '../../game/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'A58_AsparagusKnife'

const TRIGGER_ROUNDS = [8, 10, 12]

/**
 * A58 Asparagus Knife (Minor Improvement):
 * In the returning home phase of rounds 8, 10, and 12, you can take 1 vegetable
 * from exactly 1 vegetable field. You can immediately exchange it for 3 food
 * and 1 bonus VP.
 *
 * The vegetable is removed from the field (remaining decremented by 1).
 * Player selects via selection (auto-selected if only 1 field eligible).
 */

// Field effect: decrement 1 vegetable from the selected field
registerSelectionEffect('asparagus-knife-harvest', ({ player, positions }) => {
  for (const key of positions) {
    const [r, c] = key.split('-').map(Number)
    const field = player.fields.find((f) => f.row === r && f.col === c)
    if (!field) continue
    const top = fieldTopStack(field)
    if (top && top.kind === 'vegetable' && top.remaining > 0) {
      fieldDecrementTop(field)
      break // only 1 field
    }
  }
})

export const A58_AsparagusKnife = new MinorImprovement({
  id: 'A58_AsparagusKnife',
  name: 'Asparagus Knife',
  deck: 'A',
  number: 58,
  category: 'FOOD_PROVIDER',
  desc: ['In the returning home phase of rounds 8, 10, and 12, you can take 1 <VEGETABLE> from exactly 1 vegetable field. You can immediately exchange it for 3 <FOOD> and 1 bonus <SCORE>.'],
  cost: { wood: 1 },
  implemented: true,
  extraVp: true,
})

export const A58_AsparagusKnife_impl = {
  effect: {
  id: CARD_ID,
  onStartReturnHome: (state, player) => {
    if (!TRIGGER_ROUNDS.includes(state.round)) return

    const vegFields = player.fields.filter(
      (f) => fieldTopStack(f)?.kind === 'vegetable',
    )
    if (vegFields.length === 0) return

    return {
      type: 'seq',
      optional: true,
      children: [
        {
          type: 'leaf',
          actionId: 'selection',
          sourceCard: CARD_ID,
          actionContext: {
            selectionKind: 'farm-position',
            positionFilter: 'has-vegetable',
            maxSelections: 1,
            minSelections: 1,
            selectionEffect: 'asparagus-knife-harvest',
          },
        } as ActionFlow,
        gainLeaf(CARD_ID, { food: 3 }),
        { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID } as ActionFlow,
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
