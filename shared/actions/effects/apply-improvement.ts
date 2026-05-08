import type { ActionDefinition, ActionExecutionResult, GameState, PlayerState, Resource } from '../../contract/types'
import { incMajorBuilt, incMinorBuilt, incOccupationBuilt, recordDraftPlayed } from '../../logic/stats'
import { getMinorImprovement } from '../../game/minor-improvements'
import { getCardModifiers } from '../../cards/card-modifiers'
import { activateCard } from './activate-card'

const getPositiveResourceLog = (
  resources?: Partial<Resource> | null,
): Partial<Resource> | undefined => {
  if (!resources) return undefined
  const positiveEntries = Object.entries(resources).filter(
    ([, amount]) => (amount ?? 0) > 0,
  )
  if (positiveEntries.length === 0) return undefined
  return Object.fromEntries(positiveEntries) as Partial<Resource>
}

const buildImprovementLogParams = (
  improvementId: string,
  costResources: Partial<Resource>,
  options?: { returnedCards?: string[]; bonusSources?: string[] },
) => {
  const params: Record<string, unknown> = {
    improvements: improvementId,
    costResources: getPositiveResourceLog(costResources) ?? {},
  }
  if (options?.returnedCards?.length) {
    params.returnedCards = options.returnedCards
  }
  if (options?.bonusSources?.length) {
    params.bonusSources = [...options.bonusSources]
  }
  return params
}

const readActionBonusSources = (player: PlayerState): string[] | undefined => {
  const sources = player._activeActionBonusSources
  if (!sources || sources.length === 0) return undefined
  return [...sources]
}

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

const applyMajor = (state: GameState, player: PlayerState, improvementId: string) => {
  if (!player.improvements.includes(improvementId)) {
    player.improvements.push(improvementId)
  }
  state.availableMajorImprovements = state.availableMajorImprovements.filter(
    (id) => id !== improvementId,
  )
  incMajorBuilt(player)
}

const applyMinor = (state: GameState, player: PlayerState, improvementId: string) => {
  const handIdx = player.minorHand.indexOf(improvementId)
  if (handIdx >= 0) player.minorHand.splice(handIdx, 1)
  if (!player.minorPlayed.includes(improvementId)) {
    player.minorPlayed.push(improvementId)
  }
  incMinorBuilt(player)
  recordDraftPlayed(player, improvementId, state.round)

  const minor = getMinorImprovement(improvementId)
  if (minor?.providesOccupation) {
    player.extraOccupationsFromCards = player.extraOccupationsFromCards ?? []
    if (!player.extraOccupationsFromCards.includes(improvementId)) {
      player.extraOccupationsFromCards.push(improvementId)
      incOccupationBuilt(player)
    }
  }

  getCardModifiers(improvementId).forEach((modifier) => {
    if (!player.activeModifiers.some((m) => JSON.stringify(m) === JSON.stringify(modifier))) {
      player.activeModifiers.push(modifier)
    }
  })
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
    const { improvementId, kind, suppressOnBuyEffects } = params
    // Pop the seq-shared paymentInfo so onBuy effects (e.g. C60 keying its
    // 5-food gain on returnedCardId) match legacy finalize behaviour. Bonus
    // sources are read while the per-action scratchpad is still live so the
    // emitted log.playImprovement / log.playMinorImprovement entry attributes
    // any discount cards (D95 etc.) just like the old mutate-in-place flow.
    const paymentInfo = player._pendingImprovementPaymentInfo
    delete player._pendingImprovementPaymentInfo
    const bonusSources = readActionBonusSources(player)
    if (kind === 'major') {
      applyMajor(state, player, improvementId)
    } else {
      applyMinor(state, player, improvementId)
    }
    const logKey = kind === 'major' ? 'log.playImprovement' : 'log.playMinorImprovement'
    const logParams = buildImprovementLogParams(improvementId, paymentInfo?.resourcesPaid ?? {}, {
      returnedCards: paymentInfo?.returnedCardId ? [paymentInfo.returnedCardId] : undefined,
      bonusSources,
    })
    const immediateLogs = [{ key: logKey, params: logParams }]
    if (suppressOnBuyEffects) {
      return {
        type: 'ok',
        immediateLogs,
        logKey,
        logParams,
      }
    }
    const activation = activateCard(state, player, improvementId, 'onBuy', paymentInfo)
    if (activation.type === 'flow') {
      activation.immediateLogs = [...immediateLogs, ...(activation.immediateLogs ?? [])]
      return activation
    }
    return {
      type: 'ok',
      immediateLogs,
      logKey,
      logParams,
    }
  },
}
