import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { registerSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import { fieldTopStack, fieldTotalRemaining } from '../../domain/field'
import { positionKey } from '../../domain/farm'
import { parseFarmPositionKey } from '../../domain/farm-position-selection'
import { getCroppedCardFields, removeCardFieldCrop } from '../helpers/card-field'
import type { CardImpl } from '../registry'
import type { GameState, PlayerState } from '../../contract/types'

const CARD_ID = 'D071_Changeover'
const eligibleFields = (state: GameState, player: PlayerState) => {
  const harvested = new Set(
    state.harvestReapSummary?.[player.id]?.harvestedPositions?.map(positionKey) ?? [],
  )
  const cardFields = getCroppedCardFields(player)
  const cardFieldTotals = new Map<string, number>()
  for (const { field, groupKey } of cardFields) {
    cardFieldTotals.set(groupKey, (cardFieldTotals.get(groupKey) ?? 0) + fieldTotalRemaining(field))
  }
  return [
    ...player.fields
      .filter((field) => harvested.has(positionKey(field)) && fieldTotalRemaining(field) === 1)
      .map((field) => ({ tile: { row: field.row, col: field.col } })),
    ...cardFields
      .filter(({ tile, groupKey }) =>
        harvested.has(positionKey(tile)) && cardFieldTotals.get(groupKey) === 1,
      )
      .map(({ tile, sourceCard, groupKey, cardFieldSlot }) => ({
        tile,
        sourceCard,
        groupKey,
        cardFieldSlot,
      })),
  ]
}

registerSelectionEffect('discard-single-crop', ({ state, player, positions, sourceCard, eventSink }) => {
  const eligible = new Set(eligibleFields(state, player).map(({ tile }) => positionKey(tile)))
  for (const key of positions) {
    if (!eligible.has(key)) continue
    const tile = parseFarmPositionKey(key)
    if (!tile) continue
    const field = player.fields.find(f => f.row === tile.row && f.col === tile.col)
    if (field && fieldTotalRemaining(field) === 1) {
      const crop = fieldTopStack(field)!.kind
      field.stacks.length = 0
      eventSink?.emit<'farm.cropRemoved'>({
        type: 'farm.cropRemoved',
        sourceCardId: sourceCard,
        crops: [{
          location: { kind: 'field', playerId: player.id, row: field.row, col: field.col },
          crop,
          amount: 1,
        }],
        reason: 'cardEffect',
      })
      return
    }
    return removeCardFieldCrop(state, player, tile, { sourceCard, eventSink })?.flow
  }
})

const anytimeListener: CardListenerRegistration = {
  id: 'D71-changeover-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const fields = eligibleFields(context.state, context.player)
    if (fields.length === 0) return
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
              selectableTiles: fields.map(({ tile, ...metadata }) => ({ ...tile, ...metadata })),
              maxSelections: 1,
              selectionEffect: 'discard-single-crop',
            },
          },
          {
            type: 'leaf',
            actionId: 'sow',
            sourceCard: CARD_ID,
            optional: true,
            actionContext: { allowedFields: 'fromSelectedFields', sourceCard: CARD_ID },
          },
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'set-extra-data', key: 'selectedPositions', value: undefined },
          },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.D071_Changeover.anytime',
    }
  },
}

const cardImpl = {
  listeners: [anytimeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D071_Changeover = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Changeover',
    deck: 'D',
    number: 71,
    category: 'CROP_PROVIDER',
    desc: ['At any time, if a <FIELD> contains exactly 1 good as a result of a harvest, you can discard that good and immediately take a __Sow__ action limited to that <FIELD>.'],
    cost: {},
  },
  impl: cardImpl,
})

export const D071_Changeover_impl = D071_Changeover.impl
