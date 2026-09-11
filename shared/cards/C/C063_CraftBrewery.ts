import { defineMinorCard } from '../card-source'
import { registerSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import { parsePositionKey, positionKey } from '../../domain/farm'
import type { CardImpl } from '../registry'
import { getLogicalFields, mutateLogicalFields } from '../helpers/card-field'

const CARD_ID = 'C063_CraftBrewery'
const SELECTION_EFFECT = 'c63-craft-brewery-remove-grain'

registerSelectionEffect(SELECTION_EFFECT, ({ state, player, positions, eventSink }) => {
  const position = positions.length === 1 ? parsePositionKey(positions[0]!) : undefined
  const field = position && getLogicalFields(player).find((candidate) =>
    candidate.slots.some((slot) => positionKey(slot.tile) === positionKey(position)),
  )
  const slot = field && [...field.slots].reverse().find((candidate) => candidate.stack)
  if (!field || slot?.stack?.kind !== 'grain') return
  const removed = mutateLogicalFields(state, player, { sourceCard: CARD_ID, eventSink })
    .remove({ fieldId: field.id, slot: slot.index }, 1)
  return removed.ok ? removed.flow : undefined
})

const cardImpl = {
  effect: {
    id: CARD_ID,
    onHarvestFeedingPhase: (_state, player) => {
      if (player.resources.grain < 1) return
      const grainFields = getLogicalFields(player).flatMap((field) => {
        const slot = [...field.slots].reverse().find((candidate) => candidate.stack)
        if (slot?.stack?.kind !== 'grain') return []
        return [{
          ...slot.tile,
          ...(field.sourceCard ? { sourceCard: field.sourceCard, groupKey: field.groupKey, cardFieldSlot: slot.index } : {}),
        }]
      })
      if (grainFields.length === 0) return
      return {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'selection',
            actionContext: {
              selectionKind: 'farm-position',
              selectableTiles: grainFields,
              minSelections: 1,
              maxSelections: 1,
              selectionEffect: SELECTION_EFFECT,
            },
            sourceCard: CARD_ID,
          },
          { type: 'leaf', actionId: 'pay', params: { grain: 1 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { food: 4 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'bonus-vp', params: {}, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'bonus-vp', params: {}, sourceCard: CARD_ID },
        ],
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C063_CraftBrewery = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Craft Brewery",
    deck: "C",
    number: 63,
    category: "FOOD_PROVIDER",
    desc: ["In the feeding phase of each harvest, you can use this card to exchange 1 <GRAIN> from your supply plus 1 <GRAIN> from a <FIELD> for 2 bonus <SCORE> and 4 <FOOD>."],
    cost: { wood: 2, clay: 1 },
    extraVp: true,
  },
  impl: cardImpl,
})

export const C063_CraftBrewery_impl = C063_CraftBrewery.impl
