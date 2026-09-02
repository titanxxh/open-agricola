import { defineMinorCard } from '../card-source'
import { registerSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionFlow, FarmTilePosition } from '../../contract/types'
import type { DraftGameEvent, FarmCropRemovedEvent, FarmSownEvent } from '../../contract/events'
import { positionKey } from '../../domain/farm'
import { hasClaimableFieldGoodsTokens } from '../../domain/farmyard-space-token-claims'
import { addFarmyardSpaceState } from '../../domain/farmyard-space-states'
import type { CardImpl } from '../registry'
import { getLogicalFields, type LogicalField } from '../helpers/card-field'

const CARD_ID = 'M095_FallowFields'
const SELECTION_EFFECT = 'm095-fallow-fields-place-food'
type QueryableFarmSownEvent = FarmSownEvent | DraftGameEvent<'farm.sown'>
type QueryableFarmCropRemovedEvent = FarmCropRemovedEvent | DraftGameEvent<'farm.cropRemoved'>

const specialEffectLeaf = (
  params: Record<string, unknown>,
): ActionFlow => ({
  type: 'leaf',
  actionId: 'special-effect',
  sourceCard: CARD_ID,
  params,
})

const fieldPosition = (
  location: { kind: string; row?: number; col?: number },
): FarmTilePosition | undefined =>
  location.kind === 'field' &&
  Number.isFinite(location.row) &&
  Number.isFinite(location.col)
    ? { row: location.row!, col: location.col! }
    : undefined

const isFarmSownEvent = (
  event: CardListenerContext['transactionEvents'][number],
): event is QueryableFarmSownEvent =>
  event.type === 'farm.sown'

const isFarmCropRemovedEvent = (
  event: CardListenerContext['transactionEvents'][number],
): event is QueryableFarmCropRemovedEvent =>
  event.type === 'farm.cropRemoved'

const selectionTile = (field: LogicalField) => field.kind === 'farmyard'
  ? { row: field.row, col: field.col }
  : {
      row: field.row,
      col: field.col,
      sourceCard: field.sourceCard,
      groupKey: field.groupKey,
      cardFieldSlot: 0,
    }

const canonicalPosition = (player: CardListenerContext['player'], position: FarmTilePosition) => {
  const field = getLogicalFields(player).find((candidate) =>
    candidate.kind === 'farmyard'
      ? candidate.row === position.row && candidate.col === position.col
      : candidate.slots.some((slot) =>
          slot.tile.row === position.row && slot.tile.col === position.col,
        ),
  )
  return field ? { row: field.row, col: field.col } : position
}

const eventPositions = (context: CardListenerContext): FarmTilePosition[] => {
  const events = context.actionEvents ?? context.transactionEvents
  if (context.actionId === 'sow') {
    return events.flatMap((event) =>
      isFarmSownEvent(event)
        ? event.sows.flatMap((sow) => {
            const pos = fieldPosition(sow.location)
            return pos ? [pos] : []
          })
        : [],
    )
  }
  if (context.actionId !== 'reap') return []
  const trigger = context.actionContext?.trigger
  if (!trigger || typeof trigger !== 'object' || (trigger as { phase?: unknown }).phase !== 'private-field-phase') {
    return []
  }
  return events.flatMap((event) =>
    isFarmCropRemovedEvent(event) && event.reason === 'reap'
      ? event.crops.flatMap((crop) => {
          const pos = fieldPosition(crop.location)
          return pos ? [pos] : []
        })
      : [],
  )
}

registerSelectionEffect(SELECTION_EFFECT, ({ player, positions }) => {
  const fields = new Set(
    getLogicalFields(player)
      .filter((field) => field.stacks.length === 0)
      .map((field) => positionKey(field)),
  )
  for (const spaceKey of positions) {
    if (!fields.has(spaceKey)) continue
    addFarmyardSpaceState(player, {
      spaceKey,
      sourceCardId: CARD_ID,
      kind: 'field-goods-token',
      resources: { food: 2 },
      claimPolicy: 'when-sowed',
    })
  }
})

const listener: CardListenerRegistration = {
  id: 'M095-fallow-fields-claim-food',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['sow', 'reap'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const player = context.ownerPlayer ?? context.player
    const positions = eventPositions(context).map((position) => canonicalPosition(player, position))
    if (positions.length === 0) return
    if (!hasClaimableFieldGoodsTokens(player, CARD_ID, positions)) return
    return {
      flow: specialEffectLeaf({ kind: 'claim-field-goods-tokens', positions }),
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      const selectableTiles = getLogicalFields(player)
        .filter((field) => field.stacks.length === 0)
        .map(selectionTile)
        .filter((tile) => !hasClaimableFieldGoodsTokens(player, CARD_ID, [tile]))
      if (selectableTiles.length === 0) return
      return {
        type: 'leaf',
        actionId: 'selection',
        sourceCard: CARD_ID,
        actionContext: {
          selectionKind: 'farm-position',
          selectionEffect: SELECTION_EFFECT,
          minSelections: 0,
          maxSelections: Math.min(3, selectableTiles.length),
          selectableTiles,
        },
      } satisfies ActionFlow
    },
  },
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M095_FallowFields = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Fallow Fields",
    deck: "M",
    number: 95,
    category: "FOOD_PROVIDER",
    desc: [
        "Place 2 <FOOD> on each of up to 3 of your empty <FIELD>. You cannot harvest the <FOOD>. You get it when you sow in these <FIELD>."
    ],
    cost: {},
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M095_FallowFields_impl = M095_FallowFields.impl
