import { getActionTerrainOperations } from '../helpers/farmyard-events'
import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { buildSowFarmInteraction } from '../../domain/farmyard-interaction'
import { positionKey } from '../../domain/farm'
import type { FarmTilePosition } from '../../contract/types'
import type { CardImpl } from '../registry'
import { majorImprovementCount } from './moor-batch1-helpers'

const CARD_ID = 'M059_NaturesFertilizer'

const sowFlow = (context: CardListenerContext, fields: FarmTilePosition[]) => {
  if (fields.length === 0) return
  const selectedPositions = fields.map(positionKey)
  const actionContext = {
    minSelections: 1,
    maxSelections: fields.length,
    allowedFields: 'fromSelectedFields',
    sourceCard: CARD_ID,
  }
  const cardState = context.player.cardStates[CARD_ID] ?? {}
  const previewPlayer = {
    ...context.player,
    cardStates: {
      ...context.player.cardStates,
      [CARD_ID]: {
        ...cardState,
        extraData: { ...(cardState.extraData ?? {}), selectedPositions },
      },
    },
  }
  const farm = buildSowFarmInteraction(previewPlayer, actionContext)
  if (farm.farmType !== 'sow' || farm.selectableFields.length === 0) return
  return {
    type: 'seq' as const,
    children: [
      {
        type: 'leaf' as const,
        actionId: 'special-effect',
        sourceCard: CARD_ID,
        params: { kind: 'set-extra-data', key: 'selectedPositions', value: selectedPositions },
      },
      {
        type: 'leaf' as const,
        actionId: 'sow',
        sourceCard: CARD_ID,
        optional: true,
        actionContext,
      },
    ],
  }
}

const listener: CardListenerRegistration = {
  id: 'M059-natures-fertilizer-after-terrain-field',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  events: ['farm.terrainChanged'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const fields = getActionTerrainOperations(context).flatMap(event =>
      event.playerId === context.player.id
        ? event.changes.filter(change => change.fieldCreated
          && (change.before?.kind === 'moor' || context.actionId === 'slash-and-burn'))
          .map(({ row, col }) => ({ row, col })) : [])
    const flow = sowFlow(context, fields)
    if (!flow) return
    return { flow, sourceCard: CARD_ID }
  },
}

const cardImpl = {
  prerequisiteCheck: (player) => majorImprovementCount(player) >= 1,
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M059_NaturesFertilizer = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Nature's Fertilizer",
    deck: "M",
    number: 59,
    category: "ACTIONS_BOOSTER",
    desc: [
        "Each time after you take the __Slash and Burn__ special action, you also get a __Sow__ action for the new <FIELD> only. This also applies when you exchange 1 <MOOR> for 1 <FIELD> tile via a minor improvement."
    ],
    cost: {
        "vegetable": 2,
        "boar": 1
    },
    prerequisite: "1 Major Improvement",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M059_NaturesFertilizer_impl = M059_NaturesFertilizer.impl
