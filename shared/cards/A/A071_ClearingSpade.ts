import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { fieldOperationFlow } from '../../actions/plans/field-operation'
import type { CardImpl } from '../registry'
import { getLogicalFields, type LogicalField } from '../helpers/card-field'

const CARD_ID = 'A071_ClearingSpade'
const SOURCE_CROPS = ['grain', 'vegetable'] as const
const topSlot = (field: LogicalField) => [...field.slots].reverse().find((slot) => slot.stack)

const selectionTile = (field: LogicalField, slot: LogicalField['slots'][number]) => ({
  ...slot.tile,
  ...(field.sourceCard ? { sourceCard: field.sourceCard, groupKey: field.groupKey, cardFieldSlot: slot.index } : {}),
})

const emptyTargetsFor = (player: CardListenerContext['player'], crop: 'grain' | 'vegetable') =>
  getLogicalFields(player).flatMap((field) => {
    if (field.stacks.length > 0 || (field.allowedCrops && !field.allowedCrops.includes(crop))) return []
    if (field.kind === 'farmyard') return [{ row: field.row, col: field.col }]
    const slot = field.slots[0]
    return slot ? [selectionTile(field, slot)] : []
  })

const anytimeListener: CardListenerRegistration = {
  id: 'A71-clearing-spade-anytime',
  cardIds: [CARD_ID],
  actions: ['anytime'],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const sourceFields = getLogicalFields(context.player).flatMap((field) => {
      const top = topSlot(field)
      if (!top?.stack || (top.stack.kind !== 'grain' && top.stack.kind !== 'vegetable') ||
          top.stack.remaining < 2 || emptyTargetsFor(context.player, top.stack.kind).length === 0) return []
      return [selectionTile(field, top)]
    })
    if (sourceFields.length === 0) return

    return {
      flow: fieldOperationFlow(CARD_ID, { kind: 'move', amount: 1, sourceCrops: SOURCE_CROPS }, sourceFields),
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [anytimeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A071_ClearingSpade = defineMinorCard({
  presentation: { stack: true },
  meta: {
    id: CARD_ID,
    name: 'Clearing Spade',
    deck: 'A',
    number: 71,
    category: 'CROP_PROVIDER',
    desc: ['At any time, you can move 1 crop from a planted <FIELD> containing at least 2 crops to an empty <FIELD>.'],
    cost: { wood: 1 },
  },
  impl: cardImpl,
})

export const A071_ClearingSpade_impl = A071_ClearingSpade.impl
