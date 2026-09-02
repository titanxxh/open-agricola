import { defineMinorCard } from '../card-source'
import { registerSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import type { CardImpl } from '../registry'
import { getLogicalFields, mutateLogicalFields } from '../helpers/card-field'
import { parseFarmPositionKey } from '../../domain/farm-position-selection'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'E004_Thunderbolt'

registerSelectionEffect('remove-all-grain-for-wood', ({
  state,
  player,
  positions,
  sourceCard,
  eventSink,
}) => {
  for (const key of positions) {
    const tile = parseFarmPositionKey(key)
    if (!tile) continue
    const field = getLogicalFields(player).find((candidate) =>
      candidate.kind === 'farmyard'
        ? candidate.row === tile.row && candidate.col === tile.col
        : candidate.slots.some((slot) => slot.tile.row === tile.row && slot.tile.col === tile.col),
    )
    if (!field || field.stacks.at(-1)?.kind !== 'grain') continue
    const mutations = mutateLogicalFields(state, player, { sourceCard, eventSink })
    const slots = field.kind === 'farmyard'
      ? [undefined]
      : field.slots.filter((slot) => slot.stack?.kind === 'grain').map((slot) => slot.index)
    let grainCount = 0
    let flow
    for (const slot of slots) {
      const removed = mutations.remove({ fieldId: field.id, ...(slot === undefined ? {} : { slot }) })
      if (!removed.ok || removed.crop !== 'grain') continue
      grainCount += removed.amount ?? 0
      flow = removed.flow ?? flow
    }
    if (grainCount === 0) continue
    const gain = gainLeaf(CARD_ID, { wood: grainCount * 2 })
    return flow ? { type: 'seq', children: [gain, flow] } : gain
  }
})

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const selectableTiles = getLogicalFields(player).flatMap((field) => {
      if (field.stacks.at(-1)?.kind !== 'grain') return []
      if (field.kind === 'farmyard') return [{ row: field.row, col: field.col }]
      const slot = field.slots.find((candidate) => candidate.stack?.kind === 'grain')
      return slot ? [{
        ...slot.tile,
        sourceCard: field.sourceCard,
        groupKey: field.groupKey,
        cardFieldSlot: slot.index,
      }] : []
    })
    if (selectableTiles.length === 0) return

    return {
      type: 'leaf',
      actionId: 'selection',
      sourceCard: CARD_ID,
      optional: true,
      actionContext: {
        selectionKind: 'farm-position',
        selectableTiles,
        maxSelections: 1,
        selectionEffect: 'remove-all-grain-for-wood',
      },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E004_Thunderbolt = defineMinorCard({
  meta: {
    id: "E004_Thunderbolt",
    name: "Thunderbolt",
    deck: "E",
    number: 4,
    desc: ["Immediately remove all <GRAIN> from one of your <FIELD> to the general supply. Gain 2 <WOOD> for each <GRAIN> you just removed."],
    cost: {},
    prerequisite: "1 Grain Field",
    passing: true,
    category: 'PASSING_-_IMPROVEMENT/OCC_-_WOOD',
  },
  impl: cardImpl,
})

export const E004_Thunderbolt_impl = E004_Thunderbolt.impl
