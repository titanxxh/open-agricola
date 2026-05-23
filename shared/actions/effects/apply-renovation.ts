import type {
  ActionDefinition,
  ActionExecutionResult,
  PlayerState,
} from '../../contract/types'

export type ApplyRenovationParams = {
  nextType: Exclude<PlayerState['houseType'], 'wood'>
}

const isApplyRenovationParams = (raw: unknown): raw is ApplyRenovationParams => {
  if (!raw || typeof raw !== 'object') return false
  const r = raw as Record<string, unknown>
  return r.nextType === 'clay' || r.nextType === 'stone'
}

/**
 * Legacy renovation finalizer retained until Task 9 while the apply-effect
 * registration and tests still exist. Current runtime renovation is finalized by
 * `renovate-house.completeInternalChildren` after its before-host pay child
 * succeeds; new flows should not schedule `apply-renovation`.
 */
export const applyRenovationAction: ActionDefinition = {
  id: 'apply-renovation',
  // Inherit the renovate-house label for legacy direct executions so
  // `flushLeafActionDetail` emits the same action detail key as renovation.
  nameKey: 'actions.renovate-house.name',
  descriptionKey: 'actions.apply-renovation.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  emitLeafActionDetail: true,
  execute: ({ player, params, eventSink }): ActionExecutionResult => {
    if (!isApplyRenovationParams(params)) {
      return { type: 'fail', errorKey: 'log.renovationFail' }
    }
    const from = player.houseType
    player.houseType = params.nextType
    eventSink?.emit<'farm.renovated'>({
      type: 'farm.renovated',
      playerId: player.id,
      from,
      to: params.nextType,
      rooms: player.roomTiles.map(({ row, col }) => ({ row, col })),
    })
    return { type: 'ok' }
  },
}
