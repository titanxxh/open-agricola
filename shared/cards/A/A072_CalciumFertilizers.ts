import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { parsePositionKey, positionKey } from '../../domain/farm'
import type { ActionDefinition } from '../../contract/types'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import type { CardImpl } from '../registry'
import {
  getFarmyardFields,
  getLogicalFields,
  mutateLogicalFields,
  type LogicalField,
} from '../helpers/card-field'

const CARD_ID = 'A072_CalciumFertilizers'
const GROW_ACTION_ID = 'card_A072_CalciumFertilizers_growTopCrop'

const growableTop = (field: LogicalField) => {
  const top = [...field.slots].reverse().find((slot) => slot.stack)
  return top?.stack
    && (top.stack.kind === 'grain' || top.stack.kind === 'vegetable')
    && field.stacks.every((stack) => stack.kind === top.stack!.kind)
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
  execute: ({ state, player, params, eventSink }) => {
    const positions = (params as { positions?: unknown } | undefined)?.positions
    if (!Array.isArray(positions) || positions.some((value) => typeof value !== 'string')) {
      return { type: 'fail', errorKey: 'log.actionFail' }
    }
    const mutations = mutateLogicalFields(state, player, { sourceCard: CARD_ID, eventSink })
    for (const key of positions) {
      const position = parsePositionKey(key)
      const field = position && getLogicalFields(player).find(
        (candidate) => candidate.slots.some((slot) => positionKey(slot.tile) === positionKey(position)),
      )
      const top = field && growableTop(field)
      if (!field || !top) continue
      mutations.grow({ fieldId: field.id, slot: top.index }, 1)
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

    const positions = getLogicalFields(context.player).flatMap((field) => {
      const top = growableTop(field)
      return top ? [positionKey(top.tile)] : []
    })
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
  prerequisiteCheck: (player) => getFarmyardFields(player).length === 0,
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
