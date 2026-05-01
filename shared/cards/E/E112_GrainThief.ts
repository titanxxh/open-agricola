import { Occupation } from '../types'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import type { ActionDefinition, ActionFlow } from '../../game/types'
import { fieldHasCrop, fieldFindStackOfKind, fieldTopStack } from '../../game/field'
import { registerAdHocAction } from '../../actions/effects/registry'
import type { CardImpl } from '../registry'

const CARD_ID = 'E112_GrainThief'
const PROTECTED_KEY = 'protectedFields'
const PROTECT_ACTION_ID = 'card_E112_GrainThief_protect'

const grainThiefProtectAction: ActionDefinition = {
  id: PROTECT_ACTION_ID,
  nameKey: 'actions.grain-thief-protect.name',
  descriptionKey: 'actions.grain-thief-protect.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, params }) => {
    const fieldIndex = params?.fieldIndex as number | undefined
    if (fieldIndex === undefined) return { type: 'fail', logKey: 'log.actionFail' }
    const field = player.fields[fieldIndex]
    if (!field) return { type: 'fail', logKey: 'log.actionFail' }
    const top = fieldTopStack(field)
    if (!top || top.kind !== 'grain' || top.remaining <= 0) {
      return { type: 'fail', logKey: 'log.actionFail' }
    }
    const protected_ = readCardExtraData<{ index: number; remaining: number }[]>(
      player, CARD_ID, PROTECTED_KEY,
    ) ?? []
    protected_.push({ index: fieldIndex, remaining: top.remaining })
    writeCardExtraData(player, CARD_ID, PROTECTED_KEY, protected_)
    field.stacks.pop()
    player.resources.grain += 1
    return {
      type: 'ok',
      resourcesGained: { grain: 1 },
    }
  },
}
registerAdHocAction(grainThiefProtectAction)

export const E112_GrainThief = new Occupation({
  id: "E112_GrainThief",
  name: "Grain Thief",
  deck: "E",
  number: 112,
  desc: ["Each time you would harvest a grain field, you can leave the grain on the field and take 1 <GRAIN> from the general supply instead."],
  cost: {},
  players: "1+",
})

export const E112_GrainThief_impl = {
  effect: {
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
            actionId: PROTECT_ACTION_ID,
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
},
  reaches: [] as readonly string[],
} satisfies CardImpl
