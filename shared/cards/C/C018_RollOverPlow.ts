import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { registerSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import type { CardImpl } from '../registry'
import { getLogicalFields, mutateLogicalFields } from '../helpers/card-field'
import { parsePositionKey, positionKey } from '../../domain/farm'

const CARD_ID = 'C018_RollOverPlow'
registerSelectionEffect('discard-all-crops', ({ state, player, positions, eventSink }) => {
  const position = positions.length === 1 ? parsePositionKey(positions[0]!) : undefined
  const field = position && getLogicalFields(player).find((candidate) =>
    candidate.slots.some((slot) => positionKey(slot.tile) === positionKey(position)),
  )
  if (!field || field.stacks.length === 0) return
  const mutations = mutateLogicalFields(state, player, { sourceCard: CARD_ID, eventSink })
  const flows = field.slots
    .filter((slot) => slot.stack)
    .sort((a, b) => b.index - a.index)
    .flatMap((slot) => slot.layers.flatMap(() => {
      const removed = mutations.remove({ fieldId: field.id, slot: slot.index })
      return removed.ok && removed.flow ? [removed.flow] : []
    }))
  if (flows.length === 1) return flows[0]
  if (flows.length > 1) {
    return { type: 'parallel', children: flows }
  }
})

const anytimeListener: CardListenerRegistration = {
  id: 'C18-roll-over-plow-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  preScoring: true,
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const plantedFields = getLogicalFields(context.player).filter((field) => field.stacks.length > 0)
    if (plantedFields.length < 3) return
    return {
      flow: {
        type: 'seq',
        children: [
          {
            type: 'leaf',
            actionId: 'selection',
            sourceCard: CARD_ID,
            actionContext: {
              selectionKind: 'farm-position',
              selectableTiles: plantedFields.map((field) => {
                const slot = [...field.slots].reverse().find((candidate) => candidate.stack)!
                return {
                  ...slot.tile,
                  ...(field.sourceCard ? {
                    sourceCard: field.sourceCard,
                    groupKey: field.groupKey,
                    cardFieldSlot: slot.index,
                  } : {}),
                }
              }),
              minSelections: 1,
              maxSelections: 1,
              selectionEffect: 'discard-all-crops',
            },
          },
          {
            type: 'leaf',
            actionId: 'plow',
            sourceCard: CARD_ID,
          },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.C018_RollOverPlow.anytime',
    }
  },
}

const cardImpl = {
  listeners: [anytimeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C018_RollOverPlow = defineMinorCard({
  presentation: { stack: true },
  meta: {
    id: CARD_ID,
    name: 'Roll-Over Plow',
    deck: 'C',
    number: 18,
    category: 'FARM_PLANNER',
    desc: ['At any time, if you have at least 3 planted <FIELD>, you can discard all goods from one of those <FIELD> to plow 1 <FIELD>.'],
    cost: { wood: 2 },
  },
  impl: cardImpl,
})

export const C018_RollOverPlow_impl = C018_RollOverPlow.impl
