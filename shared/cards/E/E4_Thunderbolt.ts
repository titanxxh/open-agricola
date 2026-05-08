import { MinorImprovement } from '../types'
import { registerSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import { fieldTopStack } from '../../domain/field'
import type { CardImpl } from '../registry'

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

export const E4_Thunderbolt = new MinorImprovement({
  id: "E4_Thunderbolt",
  name: "Thunderbolt",
  deck: "E",
  number: 4,
  desc: ["Immediately remove all <GRAIN> from one of your fields to the general supply. Gain 2 <WOOD> for each <GRAIN> you just removed."],
  cost: {},
  prerequisite: "1 Grain Field",
  passing: true,
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
