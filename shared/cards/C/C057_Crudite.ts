import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainFlow } from '../helpers/pay-gain-node'
import type { ActionFlow, PlayerState } from '../../contract/types'
import { fieldOperationFlow } from '../../actions/plans/field-operation'
import type { CardImpl } from '../registry'
import { getLogicalFields, type LogicalFieldSlot } from '../helpers/card-field'

const CARD_ID = 'C057_Crudite'
const ANYTIME_ID = 'C57-crudite-anytime'
const eligibleFields = (player: PlayerState) =>
  getLogicalFields(player).flatMap((field) => {
    const slot = [...field.slots].reverse().find((candidate) => candidate.stack)
    return slot?.stack?.kind === 'vegetable' && slot.stack.remaining >= 2 ? [{ field, slot }] : []
  })

const selectionTile = (field: ReturnType<typeof getLogicalFields>[number], slot: LogicalFieldSlot) => ({
  ...slot.tile,
  ...(field.sourceCard ? { sourceCard: field.sourceCard, groupKey: field.groupKey, cardFieldSlot: slot.index } : {}),
})

const selectionFlow = (fields: ReturnType<typeof eligibleFields>): ActionFlow => fieldOperationFlow(CARD_ID,
  { kind: 'remove-top', amount: 1, gain: { food: 4 } }, fields.map(({ field, slot }) => selectionTile(field, slot)), fields.length, true)

const anytimeListener: CardListenerRegistration = {
  id: ANYTIME_ID,
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const fields = eligibleFields(context.player)
    if (fields.length === 0) return
    return {
      flow: selectionFlow(fields),
      sourceCard: CARD_ID,
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
