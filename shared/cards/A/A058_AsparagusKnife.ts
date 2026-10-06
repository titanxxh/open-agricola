import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow } from '../../contract/types'
import { registerSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import type { CardImpl } from '../registry'
import { getLogicalFields, mutateLogicalFields } from '../helpers/card-field'
import { parsePositionKey } from '../../domain/farm'

const CARD_ID = 'A058_AsparagusKnife'

const TRIGGER_ROUNDS = [8, 10, 12]

/**
 * A58 Asparagus Knife (Minor Improvement):
 * In the returning home phase of rounds 8, 10, and 12, you can take 1 vegetable
 * from exactly 1 vegetable field. You can immediately exchange it for 3 food
 * and 1 bonus VP.
 *
 * The vegetable is removed from the field (remaining decremented by 1).
 * Player selects via selection (auto-selected if only 1 field eligible).
 */

// Field effect: decrement 1 vegetable from the selected field
registerSelectionEffect('asparagus-knife-harvest', ({ state, player, positions, eventSink }) => {
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
    if (removed.ok) return removed.flow
  }
})

const cardImpl = {
  effect: {
  id: CARD_ID,
  onStartReturnHome: (state, player) => {
    if (!TRIGGER_ROUNDS.includes(state.round)) return

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
      type: 'seq',
      optional: true,
      children: [
        {
          type: 'leaf',
          actionId: 'selection',
          sourceCard: CARD_ID,
          actionContext: {
            selectionKind: 'farm-position',
            selectableTiles: vegFields,
            maxSelections: 1,
            minSelections: 1,
            selectionEffect: 'asparagus-knife-harvest',
          },
        } as ActionFlow,
        gainLeaf(CARD_ID, { food: 3 }),
        { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID } as ActionFlow,
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A058_AsparagusKnife = defineMinorCard({
  presentation: { counters: ['bonusVp'], stack: true },
  meta: {
    id: 'A058_AsparagusKnife',
    name: 'Asparagus Knife',
    deck: 'A',
    number: 58,
    category: 'FOOD_PROVIDER',
    desc: ['In the returning home phase of rounds 8, 10, and 12, you can take 1 <VEGETABLE> from exactly 1 <VEGETABLE> <FIELD>. You can immediately exchange it for 3 <FOOD> and 1 bonus <SCORE>.'],
    cost: { wood: 1 },
    implemented: true,
    extraVp: true,
  },
  impl: cardImpl,
})

export const A058_AsparagusKnife_impl = A058_AsparagusKnife.impl
