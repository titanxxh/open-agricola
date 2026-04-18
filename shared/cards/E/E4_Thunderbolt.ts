import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerFieldEffect } from '../../actions/effects/field-effect-registry'
import { fieldTopStack } from '../../game/field'

const CARD_ID = 'E4_Thunderbolt'

registerFieldEffect('remove-all-grain-for-wood', ({ player, fields }) => {
  for (const key of fields) {
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

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    const grainFields = player.fields.filter(f => fieldTopStack(f)?.kind === 'grain')
    if (grainFields.length === 0) return

    return {
      type: 'leaf',
      actionId: 'field-select',
      sourceCard: CARD_ID,
      optional: true,
      actionContext: {
        fieldFilter: 'has-grain',
        maxSelections: 1,
        fieldEffect: 'remove-all-grain-for-wood',
      },
    }
  },
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
