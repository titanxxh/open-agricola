import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainFlow, gainLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow, FarmTilePosition, Field } from '../../contract/types'
import { fieldTopStack } from '../../domain/field'
import { registerSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import type { CardImpl } from '../registry'
import { C57_Crudite } from '../../cards-display/C/C57_Crudite'

const CARD_ID = C57_Crudite.id
const ANYTIME_ID = 'C57-crudite-anytime'
const SELECTION_EFFECT = 'c57-crudite-remove-field-vegetables'

const eligibleFields = (player: { fields: Field[] }): Field[] =>
  player.fields.filter((field) => {
    const top = fieldTopStack(field)
    return top?.kind === 'vegetable' && top.remaining >= 2
  })

const positionsForFields = (fields: Field[]): FarmTilePosition[] =>
  fields.map(({ row, col }) => ({ row, col }))

const removeVegetablesAndGain = (positions: FarmTilePosition[]): ActionFlow => ({
  type: 'seq',
  children: [
    {
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: {
        kind: 'remove-field-crops',
        crop: 'vegetable',
        minRemaining: 2,
        positions,
      },
    },
    gainLeaf(CARD_ID, { food: positions.length * 4 }),
  ],
})

const selectionFlow = (fields: Field[]): ActionFlow => ({
  type: 'leaf',
  actionId: 'selection',
  sourceCard: CARD_ID,
  actionContext: {
    selectionKind: 'farm-position',
    selectableTiles: positionsForFields(fields),
    minSelections: 1,
    maxSelections: fields.length,
    selectionEffect: SELECTION_EFFECT,
  },
})

registerSelectionEffect(SELECTION_EFFECT, ({ positions }) => {
  const selected = positions.map((position) => {
    const [row, col] = position.split('-').map(Number)
    return { row, col }
  })
  return removeVegetablesAndGain(selected)
})

const anytimeListener: CardListenerRegistration = {
  id: ANYTIME_ID,
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const fields = eligibleFields(context.player)
    if (fields.length === 0) return
    const flow = fields.length === 1
      ? removeVegetablesAndGain(positionsForFields(fields))
      : selectionFlow(fields)
    return {
      flow,
      sourceCard: CARD_ID,
      labelKey: 'cards.C57_Crudite.anytime',
    }
  },
}

export const C57_Crudite_impl = {
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
