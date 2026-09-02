import { defineMinorCard } from '../card-source'
import { registerSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import type { CardImpl } from '../registry'
import { getLogicalFields, mutateLogicalFields } from '../helpers/card-field'
import { parsePositionKey } from '../../domain/farm'

const CARD_ID = 'A070_LiftingMachine'

registerSelectionEffect('take-vegetable', ({ state, player, positions, eventSink }) => {
  for (const key of positions) {
    const position = parsePositionKey(key)
    if (!position) continue
    const field = getLogicalFields(player).find((candidate) =>
      candidate.slots.some((slot) => slot.tile.row === position.row && slot.tile.col === position.col),
    )
    const top = field && [...field.slots].reverse().find((slot) => slot.stack)
    if (!field || top?.stack?.kind !== 'vegetable') continue
    const removed = mutateLogicalFields(state, player, {
      sourceCard: CARD_ID,
      eventSink,
    }).remove({ fieldId: field.id, slot: top.index }, 1)
    if (!removed.ok) continue
    player.resources.vegetable = (player.resources.vegetable ?? 0) + 1
    return removed.flow
  }
})

const harvestRounds = [4, 7, 9, 11, 13, 14]

const cardImpl = {
  effect: {
  id: CARD_ID,
  onReturnHome: (state, player) => {
    if (harvestRounds.includes(state.round)) return
    const vegFields = getLogicalFields(player).flatMap((field) => {
      const top = [...field.slots].reverse().find((slot) => slot.stack)
      if (top?.stack?.kind !== 'vegetable') return []
      return [{
        ...top.tile,
        ...(field.sourceCard ? { sourceCard: field.sourceCard, groupKey: field.groupKey, cardFieldSlot: top.index } : {}),
      }]
    })
    if (vegFields.length === 0) return

    return {
      type: 'leaf',
      actionId: 'selection',
      sourceCard: CARD_ID,
      optional: true,
      actionContext: {
        selectionKind: 'farm-position',
        selectableTiles: vegFields,
        maxSelections: 1,
        selectionEffect: 'take-vegetable',
      },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A070_LiftingMachine = defineMinorCard({
  meta: {
    id: "A070_LiftingMachine",
    name: "Lifting Machine",
    deck: "A",
    number: 70,
    category: "CROP_PROVIDER",
    desc: ["At the end of each round that does not end with a harvest, you can move 1 <VEGETABLE> from one of your <FIELD> to your supply. (This is not considered a field phase.)"],
    cost: {"wood":1},
    prerequisite: "3 Fields",
  },
  impl: cardImpl,
})

export const A070_LiftingMachine_impl = A070_LiftingMachine.impl
