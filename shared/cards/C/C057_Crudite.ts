import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainFlow, gainLeaf } from '../helpers/pay-gain-node'
import type { ActionDefinition, ActionFlow, GameState, PlayerState } from '../../contract/types'
import type { EventSink } from '../../contract/events'
import { registerSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import type { CardImpl } from '../registry'
import { getLogicalFields, mutateLogicalFields, type LogicalFieldSlot } from '../helpers/card-field'
import { parsePositionKey, positionKey } from '../../domain/farm'

const CARD_ID = 'C057_Crudite'
const ANYTIME_ID = 'C57-crudite-anytime'
const SELECTION_EFFECT = 'c57-crudite-remove-field-vegetables'
const SINGLE_ACTION = 'card_C057_Crudite_remove-vegetable'

const eligibleFields = (player: PlayerState) =>
  getLogicalFields(player).flatMap((field) => {
    const slot = [...field.slots].reverse().find((candidate) => candidate.stack)
    return slot?.stack?.kind === 'vegetable' && slot.stack.remaining >= 2 ? [{ field, slot }] : []
  })

const selectionTile = (field: ReturnType<typeof getLogicalFields>[number], slot: LogicalFieldSlot) => ({
  ...slot.tile,
  ...(field.sourceCard ? { sourceCard: field.sourceCard, groupKey: field.groupKey, cardFieldSlot: slot.index } : {}),
})

const selectionFlow = (fields: ReturnType<typeof eligibleFields>): ActionFlow => ({
  type: 'leaf',
  actionId: 'selection',
  sourceCard: CARD_ID,
  actionContext: {
    selectionKind: 'farm-position',
    selectableTiles: fields.map(({ field, slot }) => selectionTile(field, slot)),
    minSelections: 1,
    maxSelections: fields.length,
    selectionEffect: SELECTION_EFFECT,
  },
})

const removeVegetablesAndGain = (
  state: GameState,
  player: PlayerState,
  positions: string[],
  eventSink?: EventSink,
): ActionFlow | undefined => {
  const eligible = new Map(eligibleFields(player).map(({ field, slot }) => [positionKey(slot.tile), { field, slot }]))
  const selected = positions.map((key) => {
    const position = parsePositionKey(key)
    return position ? eligible.get(positionKey(position)) : undefined
  })
  if (selected.some((entry) => !entry) || new Set(positions).size !== positions.length) return
  const mutations = mutateLogicalFields(state, player, { sourceCard: CARD_ID, eventSink })
  const children: ActionFlow[] = []
  for (const entry of selected) {
    const removed = mutations.remove({ fieldId: entry!.field.id, slot: entry!.slot.index }, 1)
    if (!removed.ok) return
    if (removed.flow) children.push(removed.flow)
  }
  children.push(gainLeaf(CARD_ID, { food: selected.length * 4 }))
  return { type: 'seq', children }
}

registerSelectionEffect(SELECTION_EFFECT, ({ state, player, positions, eventSink }) => {
  return removeVegetablesAndGain(state, player, positions, eventSink)
})

const singleAction: ActionDefinition = {
  id: SINGLE_ACTION,
  nameKey: 'actions.special-effect.name',
  descriptionKey: 'actions.special-effect.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, params, eventSink }) => {
    const position = (params as { position?: unknown } | undefined)?.position
    const flow = typeof position === 'string'
      ? removeVegetablesAndGain(state, player, [position], eventSink)
      : undefined
    return flow ? { type: 'flow', flow } : { type: 'fail', errorKey: 'log.actionFail' }
  },
}

registerAdHocAction(singleAction)

const anytimeListener: CardListenerRegistration = {
  id: ANYTIME_ID,
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const fields = eligibleFields(context.player)
    if (fields.length === 0) return
    return {
      flow: fields.length === 1
        ? {
            type: 'leaf',
            actionId: SINGLE_ACTION,
            params: { position: positionKey(fields[0]!.slot.tile) },
            sourceCard: CARD_ID,
          }
        : selectionFlow(fields),
      sourceCard: CARD_ID,
      labelKey: 'cards.C057_Crudite.anytime',
    }
  },
}

const cardImpl = {
  listeners: [anytimeListener],
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      if (player.resources.food < 3) return
      return payGainFlow({
        cardId: CARD_ID,
        cost: { food: 3 },
        gain: { vegetable: 1 },
      })
    },
    onStartHarvestFieldPhase: (_state, player) => {
      const fields = eligibleFields(player)
      if (fields.length === 0) return
      return {
        type: 'seq',
        optional: true,
        children: [selectionFlow(fields)],
      } satisfies ActionFlow
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C057_Crudite = defineMinorCard({
  presentation: { stack: true },
  meta: {
    id: CARD_ID,
    name: 'Crudite',
    deck: 'C',
    number: 57,
    category: 'FOOD_PROVIDER',
    desc: [
        'When you play this card, you can immediately buy exactly 1 <VEGETABLE> for 3 <FOOD>. At any time, you can discard 1 <VEGETABLE> on top of another <VEGETABLE> in a <FIELD> to get 4 <FOOD>.',
      ],
    cost: {},
    evenMoreSet: true,
  },
  impl: cardImpl,
})

export const C057_Crudite_impl = C057_Crudite.impl
