import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { registerSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import { isExtraCropPlacementActionContext } from '../../actions/helpers/extra-crop-placement-context'
import type { CardImpl } from '../registry'
import { getLogicalFields, mutateLogicalFields } from '../helpers/card-field'
import { parsePositionKey, positionKey } from '../../domain/farm'

const CARD_ID = 'C069_LandConsolidation'
const SELECTION_EFFECT = 'c69-land-consolidation-swap'

const hasExtraCropPending = (context: CardListenerContext): boolean => {
  return isExtraCropPlacementActionContext(context.actionContext)
}

registerSelectionEffect(SELECTION_EFFECT, ({ state, player, positions, eventSink }) => {
  const position = positions.length === 1 ? parsePositionKey(positions[0]!) : undefined
  const field = position && getLogicalFields(player).find((candidate) =>
    candidate.slots.some((slot) => positionKey(slot.tile) === positionKey(position)),
  )
  const slot = field && [...field.slots].reverse().find((candidate) => candidate.stack)
  const total = field?.stacks.reduce((sum, stack) => sum + stack.remaining, 0) ?? 0
  if (
    !field || slot?.stack?.kind !== 'grain' || slot.stack.remaining !== 3 || total !== 3 ||
    (field.allowedCrops && !field.allowedCrops.includes('vegetable'))
  ) return
  const replaced = mutateLogicalFields(state, player, { sourceCard: CARD_ID, eventSink })
    .replace({ fieldId: field.id, slot: slot.index }, 'vegetable', 1)
  return replaced.ok ? replaced.flow : undefined
})

/**
 * C69 Land Consolidation (MinorImprovement, C, 69)
 * Rule: At any time, if you have a grain field with exactly 3 sown grain,
 * swap the grain on that field for 1 vegetable (remaining=1) on the same field.
 * No supply cost, no per-round limit — trigger is field-local.
 */
const anytimeListener: CardListenerRegistration = {
  id: 'C69-land-consolidation-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  preScoring: true,
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (hasExtraCropPending(context)) return
    const qualifying = getLogicalFields(context.player).flatMap((field) => {
      const slot = [...field.slots].reverse().find((candidate) => candidate.stack)
      const total = field.stacks.reduce((sum, stack) => sum + stack.remaining, 0)
      if (
        slot?.stack?.kind !== 'grain' || slot.stack.remaining !== 3 || total !== 3 ||
        (field.allowedCrops && !field.allowedCrops.includes('vegetable'))
      ) return []
      return [{
        ...slot.tile,
        ...(field.sourceCard ? { sourceCard: field.sourceCard, groupKey: field.groupKey, cardFieldSlot: slot.index } : {}),
      }]
    })
    if (qualifying.length === 0) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'selection',
        sourceCard: CARD_ID,
        actionContext: {
          selectionKind: 'farm-position',
          selectableTiles: qualifying,
          minSelections: 1,
          maxSelections: 1,
          selectionEffect: SELECTION_EFFECT,
        },
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.C069_LandConsolidation.anytime',
    }
  },
}

const cardImpl = {
  listeners: [anytimeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C069_LandConsolidation = defineMinorCard({
  presentation: { stack: true },
  meta: {
    id: CARD_ID,
    name: 'Land Consolidation',
    deck: 'C',
    number: 69,
    category: 'CROP_PROVIDER',
    desc: [
        'At any time, if you have a <GRAIN> <FIELD> with exactly 3 sown <GRAIN>, you can exchange the <GRAIN> on the <FIELD> for 1 <VEGETABLE> on the <FIELD>.',
      ],
    cost: {},
  },
  impl: cardImpl,
})

export const C069_LandConsolidation_impl = C069_LandConsolidation.impl
