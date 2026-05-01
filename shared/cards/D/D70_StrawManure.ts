import { MinorImprovement } from '../types'
import type { ActionFlow } from '../../game/types'
import { registerSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import { fieldFindStackOfKind, fieldHasCrop } from '../../game/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'D70_StrawManure'

registerSelectionEffect('add-vegetable', ({ player, positions }) => {
  for (const key of positions) {
    const [r, c] = key.split('-').map(Number)
    const field = player.fields.find(f => f.row === r && f.col === c)
    if (field) {
      const vegStack = fieldFindStackOfKind(field, 'vegetable')
      if (vegStack) vegStack.remaining += 1
    }
  }
})

export const D70_StrawManure = new MinorImprovement({
  id: CARD_ID,
  name: "Straw Manure",
  deck: "D",
  number: 70,
  category: "CROP_PROVIDER",
  desc: ["Before the field phase of each harvest, you can pay 1 <GRAIN> from your supply to add 1 <VEGETABLE> to each of up to 2 vegetable fields."],
  cost: {},
  prerequisite: "2 Fields",
})

export const D70_StrawManure_impl = {
  effect: {
  id: CARD_ID,
  onStartHarvestFieldPhase: (_state, player) => {
    // Need grain to pay and at least one vegetable field with crops
    if ((player.resources.grain ?? 0) < 1) return
    const vegFields = player.fields.filter(f => fieldHasCrop(f, 'vegetable'))
    if (vegFields.length === 0) return

    const children: ActionFlow[] = [
      {
        type: 'leaf',
        actionId: 'pay-resources',
        params: { grain: 1 },
        sourceCard: CARD_ID,
      },
      {
        type: 'leaf',
        actionId: 'selection',
        sourceCard: CARD_ID,
        actionContext: {
          selectionKind: 'farm-position',
          positionFilter: 'has-vegetable',
          maxSelections: 2,
          selectionEffect: 'add-vegetable',
        },
      },
    ]

    return {
      type: 'seq',
      optional: true,
      children,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
