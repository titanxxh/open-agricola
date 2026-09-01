import { defineMinorCard } from '../card-source'
import { registerSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import { fieldTopStack } from '../../domain/field'
import type { CardImpl } from '../registry'
import { getCroppedCardFields, removeCardFieldCrop } from '../helpers/card-field'
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
    const field = player.fields.find(f => f.row === tile.row && f.col === tile.col)
    const top = field ? fieldTopStack(field) : undefined
    if (field && top?.kind === 'grain') {
      const grainCount = top.remaining
      field.stacks.pop()
      eventSink?.emit<'farm.cropRemoved'>({
        type: 'farm.cropRemoved',
        sourceCardId: sourceCard,
        crops: [{
          location: { kind: 'field', playerId: player.id, row: field.row, col: field.col },
          crop: 'grain',
          amount: grainCount,
        }],
        reason: 'cardEffect',
      })
      return gainLeaf(CARD_ID, { wood: grainCount * 2 })
    }
    const removed = removeCardFieldCrop(state, player, tile, {
      sourceCard,
      eventSink,
    })
    if (!removed || removed.crop !== 'grain') continue
    const gain = gainLeaf(CARD_ID, { wood: removed.amount * 2 })
    return removed.flow
      ? { type: 'seq', children: [gain, removed.flow] }
      : gain
  }
})

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const selectableTiles = [
      ...player.fields
        .filter((field) => fieldTopStack(field)?.kind === 'grain')
        .map((field) => ({ row: field.row, col: field.col })),
      ...getCroppedCardFields(player)
        .filter(({ field }) => fieldTopStack(field)?.kind === 'grain')
        .map(({ tile, sourceCard, groupKey, cardFieldSlot }) => ({
          ...tile,
          sourceCard,
          groupKey,
          cardFieldSlot,
        })),
    ]
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
