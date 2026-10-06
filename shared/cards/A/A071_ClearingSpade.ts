import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { writeCardExtraData, readCardExtraData } from '../helpers/card-state'
import { registerSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import type { CardImpl } from '../registry'
import { getLogicalFields, mutateLogicalFields, type LogicalField } from '../helpers/card-field'
import { parsePositionKey, positionKey } from '../../domain/farm'

const CARD_ID = 'A071_ClearingSpade'
const topSlot = (field: LogicalField) => [...field.slots].reverse().find((slot) => slot.stack)

const selectionTile = (field: LogicalField, slot: LogicalField['slots'][number]) => ({
  ...slot.tile,
  ...(field.sourceCard ? { sourceCard: field.sourceCard, groupKey: field.groupKey, cardFieldSlot: slot.index } : {}),
})

const findField = (player: CardListenerContext['player'], key: string) => {
  const position = parsePositionKey(key)
  return position && getLogicalFields(player).find((field) =>
    (field.kind === 'farmyard' && positionKey(field) === positionKey(position)) ||
    field.slots.some((slot) => positionKey(slot.tile) === positionKey(position)),
  )
}

const emptyTargetsFor = (player: CardListenerContext['player'], crop: 'grain' | 'vegetable' | 'wood' | 'stone') =>
  getLogicalFields(player).flatMap((field) => {
    if (field.stacks.length > 0 || (field.allowedCrops && !field.allowedCrops.includes(crop))) return []
    if (field.kind === 'farmyard') return [{ row: field.row, col: field.col }]
    const slot = field.slots[0]
    return slot ? [selectionTile(field, slot)] : []
  })

registerSelectionEffect('store-source-field', ({ player, positions, sourceCard }) => {
  if (!sourceCard || positions.length === 0) return
  const field = findField(player, positions[0]!)
  const top = field && topSlot(field)
  if (!top?.stack || top.stack.remaining < 2) return
  const targets = emptyTargetsFor(player, top.stack.kind)
  if (targets.length === 0) return
  writeCardExtraData(player, sourceCard, 'moveSourceField', positions[0])
  return {
    type: 'leaf',
    actionId: 'selection',
    sourceCard: CARD_ID,
    actionContext: {
      selectionKind: 'farm-position',
      selectableTiles: targets,
      maxSelections: 1,
      selectionEffect: 'move-crop-from-source',
    },
  }
})

registerSelectionEffect('move-crop-from-source', ({ state, player, positions, sourceCard, eventSink }) => {
  const sourceKey = readCardExtraData<string>(player, sourceCard!, 'moveSourceField')
  if (sourceKey && positions.length > 0) {
    const targetField = findField(player, positions[0]!)
    const sourceField = findField(player, sourceKey)
    const top = sourceField && topSlot(sourceField)
    const targetSlot = targetField?.kind === 'farmyard' ? 0 : targetField?.slots[0]?.index
    if (!sourceField || !top?.stack || top.stack.remaining < 2 || !targetField || targetSlot === undefined) return
    if (targetField.stacks.length > 0 || (targetField.allowedCrops && !targetField.allowedCrops.includes(top.stack.kind))) return
    const mutations = mutateLogicalFields(state, player, { sourceCard: CARD_ID, eventSink })
    const removed = mutations.remove({ fieldId: sourceField.id, slot: top.index }, 1)
    if (!removed.ok) return
    const placed = mutations.place({ fieldId: targetField.id, slot: targetSlot }, top.stack.kind, 1)
    if (!placed.ok) throw new Error(`[${CARD_ID}] failed to place selected crop`)
    return removed.flow
  }
})

const anytimeListener: CardListenerRegistration = {
  id: 'A71-clearing-spade-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const sourceFields = getLogicalFields(context.player).flatMap((field) => {
      const top = topSlot(field)
      if (!top?.stack || top.stack.remaining < 2 || emptyTargetsFor(context.player, top.stack.kind).length === 0) return []
      return [selectionTile(field, top)]
    })
    if (sourceFields.length === 0) return

    return {
      flow: {
        type: 'leaf',
        actionId: 'selection',
        sourceCard: CARD_ID,
        actionContext: {
          selectionKind: 'farm-position',
          selectableTiles: sourceFields,
          maxSelections: 1,
          selectionEffect: 'store-source-field',
        },
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.A071_ClearingSpade.anytime',
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
