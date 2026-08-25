import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { fieldTopStack } from '../../domain/field'
import { parsePositionKey, positionKey } from '../../domain/farm'
import type { ActionDefinition, Field } from '../../contract/types'
import type { FarmCropAddedEvent } from '../../contract/events'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import type { CardImpl } from '../registry'

const CARD_ID = 'A072_CalciumFertilizers'
const GROW_ACTION_ID = 'card_A072_CalciumFertilizers_growTopCrop'

const growableTop = (field: Field) => {
  const top = fieldTopStack(field)
  return top
    && top.remaining >= 1
    && (top.kind === 'grain' || top.kind === 'vegetable')
    && field.stacks.every((stack) => stack.kind === top.kind)
    ? top
    : undefined
}

const growTopCropAction: ActionDefinition = {
  id: GROW_ACTION_ID,
  nameKey: 'actions.special-effect.name',
  descriptionKey: 'actions.special-effect.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_state, player) => player.minorPlayed.includes(CARD_ID),
  execute: ({ player, params, eventSink }) => {
    const positions = (params as { positions?: unknown } | undefined)?.positions
    if (!Array.isArray(positions) || positions.some((value) => typeof value !== 'string')) {
      return { type: 'fail', errorKey: 'log.actionFail' }
    }
    const crops: FarmCropAddedEvent['crops'] = []
    for (const key of positions) {
      const position = parsePositionKey(key)
      const field = position && player.fields.find(
        (candidate) => candidate.row === position.row && candidate.col === position.col,
      )
      const top = field && growableTop(field)
      if (!field || !top) continue
      top.remaining += 1
      crops.push({
        location: { kind: 'field', playerId: player.id, row: field.row, col: field.col },
        crop: top.kind,
        amount: 1,
      })
    }
    if (crops.length > 0) {
      eventSink?.emit<'farm.cropAdded'>({
        type: 'farm.cropAdded',
        sourceCardId: CARD_ID,
        crops,
        reason: 'cardEffect',
      })
    }
    return { type: 'ok' }
  },
}

registerAdHocAction(growTopCropAction)

const listener: CardListenerRegistration = {
  id: 'A72-calcium-fertilizers-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space) return
    if (context.space.id !== 'eastern-quarry' && context.space.id !== 'western-quarry') return

    // Find planted fields with crops remaining
    const positions = context.player.fields.flatMap((field) => (
      growableTop(field) ? [positionKey(field)] : []
    ))
    if (positions.length === 0) return
    return {
      flow: {
        type: 'leaf',
        actionId: GROW_ACTION_ID,
        sourceCard: CARD_ID,
        params: { positions },
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A072_CalciumFertilizers = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Calcium Fertilizers",
    deck: "A",
    number: 72,
    category: "CROP_PROVIDER",
    desc: ["Each time you use a __Quarry__ accumulation space, add 1 additional good of the respective type to each of your planted <FIELD> growing a single type of crop."],
    cost: {},
    prerequisite: "No Field Tiles",
  },
  impl: cardImpl,
})

export const A072_CalciumFertilizers_impl = A072_CalciumFertilizers.impl
