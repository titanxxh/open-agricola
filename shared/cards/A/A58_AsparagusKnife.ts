import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow } from '../../game/types'
import { registerFieldEffect } from '../../actions/effects/field-effect-registry'
import { fieldTopStack, fieldDecrementTop } from '../../game/field'

const CARD_ID = 'A58_AsparagusKnife'

const TRIGGER_ROUNDS = [8, 10, 12]

/**
 * A58 Asparagus Knife (Minor Improvement):
 * In the returning home phase of rounds 8, 10, and 12, you can take 1 vegetable
 * from exactly 1 vegetable field. You can immediately exchange it for 3 food
 * and 1 bonus VP.
 *
 * The vegetable is removed from the field (remaining decremented by 1).
 * Player selects via field-select (auto-selected if only 1 field eligible).
 */

// Field effect: decrement 1 vegetable from the selected field
registerFieldEffect('asparagus-knife-harvest', ({ player, fields }) => {
  for (const key of fields) {
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

registerCardEffect({
  id: CARD_ID,
  onStartReturnHome: (state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
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
          actionId: 'field-select',
          sourceCard: CARD_ID,
          actionContext: {
            fieldFilter: 'has-vegetable',
            maxSelections: 1,
            minSelections: 1,
            fieldEffect: 'asparagus-knife-harvest',
          },
        } as ActionFlow,
        gainLeaf(CARD_ID, { food: 3 }),
        { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID } as ActionFlow,
      ],
    }
  },
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
})
