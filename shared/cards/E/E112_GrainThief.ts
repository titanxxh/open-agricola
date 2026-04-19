import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import type { ActionFlow } from '../../game/types'
import { fieldHasCrop, fieldFindStackOfKind } from '../../game/field'

const CARD_ID = 'E112_GrainThief'
const PROTECTED_KEY = 'protectedFields'

registerCardEffect({
  id: CARD_ID,
  onHarvestFieldPhase: (_state, player) => {
    // Clear stale data
    writeCardExtraData(player, CARD_ID, PROTECTED_KEY, null)
    const grainFields = player.fields
      .map((f, i) => ({ field: f, index: i }))
      .filter(({ field }) => fieldHasCrop(field, 'grain'))
    if (grainFields.length === 0) return
    const children: ActionFlow[] = grainFields.map(({ field, index }) => {
      const grainStack = fieldFindStackOfKind(field, 'grain')
      return {
        type: 'xor' as const,
        children: [
          {
            type: 'leaf' as const,
            actionId: 'grain-thief-protect',
            params: { fieldIndex: index },
            sourceCard: CARD_ID,
            choiceLabelKey: 'ui.grainThiefProtect',
            choiceLabelParams: { remaining: grainStack?.remaining ?? 0 },
          },
          {
            type: 'leaf' as const,
            actionId: 'noop',
            choiceLabelKey: 'ui.grainThiefNormalHarvest',
          },
        ],
      }
    })
    return { type: 'seq', children }
  },
  onEndHarvestFieldPhase: (_state, player) => {
    const protectedFields = readCardExtraData<{ index: number; remaining: number }[]>(
      player, CARD_ID, PROTECTED_KEY,
    ) ?? []
    writeCardExtraData(player, CARD_ID, PROTECTED_KEY, null)
    for (const { index, remaining } of protectedFields) {
      const field = player.fields[index]
      if (!field) continue
      // Restore the grain stack (protection reverses the reap decrement)
      const grainStack = fieldFindStackOfKind(field, 'grain')
      if (grainStack) {
        grainStack.remaining = remaining
      } else {
        field.stacks.push({ kind: 'grain', remaining })
      }
    }
  },
})

export const E112_GrainThief = new Occupation({
  id: "E112_GrainThief",
  name: "Grain Thief",
  deck: "E",
  number: 112,
  desc: ["Each time you would harvest a grain field, you can leave the grain on the field and take 1 <GRAIN> from the general supply instead."],
  cost: {},
  players: "1+",
})
