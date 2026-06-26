import type { ActionDefinition, ActionFlow } from '../contract/types'
import { runCardListeners } from '../cards/card-listeners'
import {
  applyMoorSpecialAction,
  createMoorSpecialActionSpace,
  type MoorSpecialActionPayload,
} from './special-actions'
import type { MoorSpecialActionId } from './types'

export const MOOR_SPECIAL_ACTION_APPLY_ACTION_ID = 'moor-special-action-apply'

const MOOR_SPECIAL_ACTION_IDS = new Set<string>([
  'cut-peat',
  'fell-trees',
  'slash-and-burn',
  'hiring-fair',
  'horse-market',
  'black-market',
  'illicit-work',
])

const combineFlows = (flows: ActionFlow[]): ActionFlow | undefined => {
  if (flows.length === 0) return undefined
  if (flows.length === 1) return flows[0]
  return { type: 'seq', children: flows }
}

const readParams = (params?: Record<string, unknown>) => {
  const cardId = params?.cardId
  const actionId = params?.actionId
  if (typeof cardId !== 'string' || typeof actionId !== 'string') return null
  if (!MOOR_SPECIAL_ACTION_IDS.has(actionId)) return null
  return {
    cardId,
    actionId: actionId as MoorSpecialActionId,
    payload: (params?.payload ?? {}) as MoorSpecialActionPayload,
  }
}

export const moorSpecialActionApplyAction: ActionDefinition = {
  id: MOOR_SPECIAL_ACTION_APPLY_ACTION_ID,
  nameKey: 'actions.moor-special-action-apply.name',
  descriptionKey: 'actions.moor-special-action-apply.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, params }) => {
    const parsed = readParams(params)
    if (!parsed) return { type: 'fail', errorKey: 'special action unavailable' }
    const playerIndex = state.players.findIndex((candidate) => candidate.id === player.id)
    if (playerIndex < 0) return { type: 'fail', errorKey: 'special action unavailable' }

    const result = applyMoorSpecialAction(
      state,
      playerIndex,
      parsed.cardId,
      parsed.actionId,
      parsed.payload,
    )
    if (!result.ok) return { type: 'fail', errorKey: result.error }

    const listenerFlows = runCardListeners({
      state,
      player,
      space: createMoorSpecialActionSpace(parsed.actionId),
      actionId: parsed.actionId,
      phase: 'after',
      result: { type: 'ok' },
      extraData: {
        specialActionCardId: parsed.cardId,
        payload: parsed.payload,
      },
    }, undefined, { stampFlowOwner: true })
      .map((entry) => entry.flow)
      .filter((flow): flow is ActionFlow => !!flow)
    const followUpFlow = combineFlows([
      ...listenerFlows,
      ...(result.followUpFlow ? [result.followUpFlow] : []),
    ])
    return followUpFlow ? { type: 'flow', flow: followUpFlow } : { type: 'ok' }
  },
}
