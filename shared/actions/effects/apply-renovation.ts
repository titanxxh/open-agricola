import type {
  ActionDefinition,
  ActionExecutionResult,
  PlayerState,
} from '../../game/types'

export type ApplyRenovationParams = {
  nextType: Exclude<PlayerState['houseType'], 'wood'>
}

const isApplyRenovationParams = (raw: unknown): raw is ApplyRenovationParams => {
  if (!raw || typeof raw !== 'object') return false
  const r = raw as Record<string, unknown>
  return r.nextType === 'clay' || r.nextType === 'stone'
}

/**
 * Finalize leaf for the renovation flow. Sits inside `seq:[pay, apply-renovation]`
 * so the player's `houseType` is only mutated after the pay leaf has successfully
 * deducted resources. Mirrors `apply-improvement` in shape — the seq pattern keeps
 * `_pendingImprovementPaymentInfo`-style stash fields out of the renovation path
 * because nothing downstream needs the paymentInfo (no onBuy effects keyed on it).
 */
export const applyRenovationAction: ActionDefinition = {
  id: 'apply-renovation',
  nameKey: 'actions.apply-renovation.name',
  descriptionKey: 'actions.apply-renovation.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, params }): ActionExecutionResult => {
    if (!isApplyRenovationParams(params)) {
      return { type: 'fail', logKey: 'log.renovationFail' }
    }
    player.houseType = params.nextType
    return { type: 'ok' }
  },
}
