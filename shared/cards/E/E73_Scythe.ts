import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import type { ActionFlow } from '../../game/types'
import { fieldIsEmpty, fieldTopStack } from '../../game/field'

const CARD_ID = 'E73_Scythe'

registerCardEffect({
  id: CARD_ID,
  onStartHarvestFieldPhase: (_state, player) => {
    const harvestable = player.fields
      .map((f, i) => ({ field: f, index: i }))
      .filter(({ field }) => !fieldIsEmpty(field))
    if (harvestable.length === 0) return
    const children: ActionFlow[] = harvestable.map(({ field, index }) => {
      const top = fieldTopStack(field)
      return {
        type: 'leaf' as const,
        actionId: 'scythe-harvest-field',
        params: { fieldIndex: index },
        sourceCard: CARD_ID,
        choiceLabelKey: 'ui.interactionScytheField',
        choiceLabelParams: { crop: top?.kind ?? null, amount: top?.remaining ?? 0 },
      }
    })
    children.push({ type: 'leaf', actionId: 'noop', choiceLabelKey: 'ui.interactionDecline' })
    return { type: 'xor', children }
  },
})

export const E73_Scythe = new MinorImprovement({
  id: "E73_Scythe",
  name: "Scythe",
  deck: "E",
  number: 73,
  desc: ["During the field phase of each harvest, you can select exactly one of your fields and harvest all the crops planted in it."],
  cost: {"wood":1},
})
