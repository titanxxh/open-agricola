import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { registerSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import { positionKey } from '../../domain/farm'
import { parseFarmPositionKey } from '../../domain/farm-position-selection'
import { getLogicalFields, mutateLogicalFields } from '../helpers/card-field'
import type { CardImpl } from '../registry'
import type { GameState, PlayerState } from '../../contract/types'

const CARD_ID = 'D071_Changeover'
const eligibleFields = (state: GameState, player: PlayerState) => {
  const harvested = new Set(
    state.harvestReapSummary?.[player.id]?.harvestedPositions?.map(positionKey) ?? [],
  )
  return getLogicalFields(player).flatMap((field) => {
    const remaining = field.stacks.reduce((sum, stack) => sum + stack.remaining, 0)
    if (!harvested.has(positionKey(field)) || remaining !== 1) return []
    if (field.kind === 'farmyard') return [{ tile: { row: field.row, col: field.col } }]
    const slot = field.slots.find((candidate) => candidate.stack)
    return slot ? [{
      tile: slot.tile,
      sourceCard: field.sourceCard,
      groupKey: field.groupKey,
      cardFieldSlot: slot.index,
    }] : []
  })
}

registerSelectionEffect('discard-single-crop', ({ state, player, positions, sourceCard, eventSink }) => {
  const eligible = new Set(eligibleFields(state, player).map(({ tile }) => positionKey(tile)))
  for (const key of positions) {
    if (!eligible.has(key)) continue
    const tile = parseFarmPositionKey(key)
    if (!tile) continue
    const removed = mutateLogicalFields(state, player, { sourceCard, eventSink }).remove(tile, 1)
    return removed.ok ? removed.flow : undefined
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
  presentation: { stack: true },
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
