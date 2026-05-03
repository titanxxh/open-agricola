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
  // Inherit the renovate-house label so `flushLeafActionDetail` emits a
  // `log.actionDetail` with action='actions.renovate-house.name' — A123 /
  // B107 / FrameBuilder etc. parse that string to attribute their bonus
  // contribution. Apply-renovation is the leaf where the actual renovation
  // mutation happens, so it's the natural carrier for the detail flush.
  nameKey: 'actions.renovate-house.name',
  descriptionKey: 'actions.apply-renovation.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  emitLeafActionDetail: true,
  execute: ({ player, params }): ActionExecutionResult => {
    if (!isApplyRenovationParams(params)) {
      return { type: 'fail', logKey: 'log.renovationFail' }
    }
    player.houseType = params.nextType
    return { type: 'ok' }
  },
}
