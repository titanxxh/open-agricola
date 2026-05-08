import { registerSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import { fieldTopStack } from '../../domain/field'
import type { CardImpl } from '../registry'
import { E4_Thunderbolt } from '../../cards-display/E/E4_Thunderbolt'

const CARD_ID = 'E4_Thunderbolt'

registerSelectionEffect('remove-all-grain-for-wood', ({ player, positions }) => {
  for (const key of positions) {
    const [r, c] = key.split('-').map(Number)
    const field = player.fields.find(f => f.row === r && f.col === c)
    if (!field) continue
    const top = fieldTopStack(field)
    if (top && top.kind === 'grain') {
      const grainCount = top.remaining
      field.stacks.pop()
      player.resources.wood = (player.resources.wood ?? 0) + grainCount * 2
    }
  }
})

export const E4_Thunderbolt_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const grainFields = player.fields.filter(f => fieldTopStack(f)?.kind === 'grain')
    if (grainFields.length === 0) return

    return {
      type: 'leaf',
      actionId: 'selection',
      sourceCard: CARD_ID,
      optional: true,
      actionContext: {
        selectionKind: 'farm-position',
        positionFilter: 'has-grain',
        maxSelections: 1,
        selectionEffect: 'remove-all-grain-for-wood',
      },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
