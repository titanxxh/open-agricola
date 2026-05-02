import type { ActionDefinition, ActionExecutionResult } from '../../game/types'

export type ApplyImprovementParams = {
  improvementId: string
  kind: 'major' | 'minor'
  suppressOnBuyEffects?: boolean
}

const isApplyImprovementParams = (raw: unknown): raw is ApplyImprovementParams => {
  if (!raw || typeof raw !== 'object') return false
  const r = raw as Record<string, unknown>
  return typeof r.improvementId === 'string' && (r.kind === 'major' || r.kind === 'minor')
}

export const applyImprovementAction: ActionDefinition = {
  id: 'apply-improvement',
  nameKey: 'actions.apply-improvement.name',
  descriptionKey: 'actions.apply-improvement.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, params, state }): ActionExecutionResult => {
    if (!isApplyImprovementParams(params)) {
      return { type: 'fail', logKey: 'log.improvementFail' }
    }
    const { improvementId, kind } = params
    if (kind === 'major') {
      if (!player.improvements.includes(improvementId)) {
        player.improvements.push(improvementId)
      }
      state.availableMajorImprovements = state.availableMajorImprovements.filter(
        (id) => id !== improvementId,
      )
    } else {
      const handIdx = player.minorHand.indexOf(improvementId)
      if (handIdx >= 0) player.minorHand.splice(handIdx, 1)
      if (!player.minorPlayed.includes(improvementId)) {
        player.minorPlayed.push(improvementId)
      }
    }
    return { type: 'ok' }
  },
}
