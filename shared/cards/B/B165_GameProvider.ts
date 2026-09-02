import { defineOccupationCard } from '../card-source'
import { registerSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import type { CardImpl } from '../registry'
import { getLogicalFields, mutateLogicalFields } from '../helpers/card-field'
import { parsePositionKey, positionKey } from '../../domain/farm'

const CARD_ID = 'B165_GameProvider'

registerSelectionEffect('discard-grain-for-pigs', ({ state, player, positions, eventSink }) => {
  const selected = positions.map((key) => {
    const position = parsePositionKey(key)
    const field = position && getLogicalFields(player).find((candidate) =>
      candidate.slots.some((slot) => positionKey(slot.tile) === positionKey(position)),
    )
    const top = field && [...field.slots].reverse().find((slot) => slot.stack)
    return field && top?.stack?.kind === 'grain' ? { field, slot: top } : null
  })
  const selectedFields = selected.filter((field): field is NonNullable<typeof field> => field !== null)
  if (selectedFields.length !== selected.length || new Set(selectedFields.map(({ field }) => field.id)).size !== selected.length) return
  const mutations = mutateLogicalFields(state, player, { sourceCard: CARD_ID, eventSink })
  const flows = []
  for (const { field, slot } of selectedFields) {
    const removed = mutations.remove({ fieldId: field.id, slot: slot.index }, 1)
    if (!removed.ok) throw new Error(`[${CARD_ID}] failed to remove selected grain`)
    if (removed.flow) flows.push(removed.flow)
  }
  const grainsRemoved = selectedFields.length
  const pigs = grainsRemoved >= 4 ? 3 : grainsRemoved >= 3 ? 2 : grainsRemoved >= 1 ? 1 : 0
  player.resources.boar = (player.resources.boar ?? 0) + pigs
  return flows.length > 0 ? { type: 'parallel', children: flows } : undefined
})

const cardImpl = {
  effect: {
  id: CARD_ID,
  onStartHarvestFieldPhase: (_state, player) => {
    const grainFields = getLogicalFields(player).flatMap((field) => {
      const top = [...field.slots].reverse().find((slot) => slot.stack)
      if (top?.stack?.kind !== 'grain') return []
      return [{
        ...top.tile,
        ...(field.sourceCard ? { sourceCard: field.sourceCard, groupKey: field.groupKey, cardFieldSlot: top.index } : {}),
      }]
    })
    if (grainFields.length === 0) return

    return {
      type: 'leaf',
      actionId: 'selection',
      sourceCard: CARD_ID,
      optional: true,
      actionContext: {
        selectionKind: 'farm-position',
        selectableTiles: grainFields,
        minSelections: 1,
        maxSelections: Math.min(4, grainFields.length),
        allowedSelectionCounts: [1, 3, 4],
        selectionEffect: 'discard-grain-for-pigs',
      },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B165_GameProvider = defineOccupationCard({
  meta: {
    id: "B165_GameProvider",
    name: "Game Provider",
    deck: "B",
    number: 165,
    category: "LIVESTOCK_PROVIDER",
    desc: ["Immediately before each harvest, you can discard 1/3/4 <GRAIN> from different <FIELD> to get 1/2/3 <PIG>."],
    cost: {},
    players: "4+",
  },
  impl: cardImpl,
})

export const B165_GameProvider_impl = B165_GameProvider.impl
