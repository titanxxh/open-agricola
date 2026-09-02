import { defineMinorCard } from '../card-source'
import type { ActionFlow } from '../../contract/types'
import { registerSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import type { CardImpl } from '../registry'
import { getLogicalFields, mutateLogicalFields } from '../helpers/card-field'
import { parsePositionKey, positionKey } from '../../domain/farm'

const CARD_ID = 'D070_StrawManure'
registerSelectionEffect('add-vegetable', ({ state, player, positions, eventSink }) => {
  const fields = positions.map((key) => {
    const position = parsePositionKey(key)
    const field = position && getLogicalFields(player).find((candidate) =>
      candidate.slots.some((slot) => positionKey(slot.tile) === positionKey(position)),
    )
    const slot = field && [...field.slots].reverse().find((candidate) => candidate.stack)
    return field && slot?.stack?.kind === 'vegetable' ? { field, slot } : undefined
  })
  if (fields.some((field) => !field) || new Set(fields.map((entry) => entry?.field.id)).size !== fields.length) return
  const mutations = mutateLogicalFields(state, player, { sourceCard: CARD_ID, eventSink })
  const flows: ActionFlow[] = []
  for (const entry of fields) {
    const grown = mutations.grow({ fieldId: entry!.field.id, slot: entry!.slot.index }, 1)
    if (!grown.ok) return
    if (grown.flow) flows.push(grown.flow)
  }
  if (flows.length === 1) return flows[0]
  if (flows.length > 1) return { type: 'parallel', children: flows }
})

const cardImpl = {
  effect: {
  id: CARD_ID,
  preHarvestGoodsWantedBeforeReap: ['grain'],
  onStartHarvestFieldPhase: (_state, player) => {
    // Need grain to pay and at least one vegetable field with crops
    if ((player.resources.grain ?? 0) < 1) return
    const vegFields = getLogicalFields(player).flatMap((field) => {
      const slot = [...field.slots].reverse().find((candidate) => candidate.stack)
      if (slot?.stack?.kind !== 'vegetable') return []
      return [{
        ...slot.tile,
        ...(field.sourceCard ? { sourceCard: field.sourceCard, groupKey: field.groupKey, cardFieldSlot: slot.index } : {}),
      }]
    })
    if (vegFields.length === 0) return

    const children: ActionFlow[] = [
      {
        type: 'leaf',
        actionId: 'pay',
        params: { grain: 1 },
        sourceCard: CARD_ID,
      },
      {
        type: 'leaf',
        actionId: 'selection',
        sourceCard: CARD_ID,
        actionContext: {
          selectionKind: 'farm-position',
          selectableTiles: vegFields,
          minSelections: 1,
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

export const D070_StrawManure = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Straw Manure",
    deck: "D",
    number: 70,
    category: "CROP_PROVIDER",
    desc: ["Before the field phase of each harvest, you can pay 1 <GRAIN> from your supply to add 1 <VEGETABLE> to each of up to 2 <VEGETABLE> <FIELD>."],
    cost: {},
    prerequisite: "2 Fields",
  },
  impl: cardImpl,
})

export const D070_StrawManure_impl = D070_StrawManure.impl
