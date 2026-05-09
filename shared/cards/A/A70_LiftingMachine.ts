import { registerSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import { fieldTopStack, fieldDecrementTop } from '../../domain/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'A70_LiftingMachine'

registerSelectionEffect('take-vegetable', ({ player, positions }) => {
  for (const key of positions) {
    const [r, c] = key.split('-').map(Number)
    const field = player.fields.find(f => f.row === r && f.col === c)
    if (!field) continue
    const top = fieldTopStack(field)
    if (top && top.kind === 'vegetable' && top.remaining > 0) {
      fieldDecrementTop(field)
      player.resources.vegetable = (player.resources.vegetable ?? 0) + 1
    }
  }
})

const harvestRounds = [4, 7, 9, 11, 13, 14]

export const A70_LiftingMachine_impl = {
  effect: {
  id: CARD_ID,
  onReturnHome: (state, player) => {
    if (harvestRounds.includes(state.round)) return
    const vegFields = player.fields.filter(f => fieldTopStack(f)?.kind === 'vegetable')
    if (vegFields.length === 0) return

    return {
      type: 'leaf',
      actionId: 'selection',
      sourceCard: CARD_ID,
      optional: true,
      actionContext: {
        selectionKind: 'farm-position',
        positionFilter: 'has-vegetable',
        maxSelections: 1,
        selectionEffect: 'take-vegetable',
      },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
