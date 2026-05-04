import type { ComplexCost, GameState, PlayerState, Resource } from '../../game/types'
import type { PaymentInfo } from '../../cards/card-effects'
import { getMinorImprovement } from '../../game/minor-improvements'
import { PaymentSolver } from '../payment'
import type { PaymentCtx } from '../payment'
import { majorCardDefinitions, getMajorCard } from '../../cards/major'
import { meetsCardPrerequisites } from '../../cards/helpers/prerequisites'
import { resolveCardPreviewCostByProvider } from '../payment/internal'
import { isMajorCardId, isFireplaceIdentityCard } from '../../cards/helpers/card-type'
import { isBlockedByMajorImprovementActionGate } from './improvement-pool'

export type ResolvedMinorImprovement = NonNullable<ReturnType<typeof getMinorImprovement>>

/**
 * Returns the list of card IDs a player can use to satisfy a cost that
 * requires returning a Fireplace card — any played card declaring
 * `fireplaceIdentity` (Major Fireplace 1/2 plus any minor like D25 with the
 * same marker).
 */
export const getFireplaceReturnPool = (player: PlayerState): string[] => [
  ...player.improvements.filter(isFireplaceIdentityCard),
  ...player.minorPlayed.filter(isFireplaceIdentityCard),
]

/**
 * Returns the effective `playedCards` pool for cost resolution that may
 * include a Fireplace return. If the cost requires returning a Fireplace,
 * include both player.improvements AND any fireplaceIdentity minors.
 */
export const getPlayedCardsForCost = (
  player: PlayerState,
  cost: Partial<PlayerState['resources']> | ComplexCost | null,
): string[] => {
  if (!cost || !PaymentSolver.isComplexCost(cost)) return player.improvements
  const list = cost.cards?.list
  if (!Array.isArray(list)) return player.improvements
  if (!list.some(isFireplaceIdentityCard)) return player.improvements
  return getFireplaceReturnPool(player)
}

export const parseImprovementChoice = (choice: string): { kind: 'major' | 'minor' | null; id: string } => {
  if (choice.startsWith('major:')) {
    return { kind: 'major', id: choice.replace('major:', '') }
  }
  if (choice.startsWith('minor:')) {
    return { kind: 'minor', id: choice.replace('minor:', '') }
  }
  // Bare id — infer kind from which catalog the id lives in. Falls back to
  // null for ids not (yet) registered (e.g. fixture/test ids resolved later).
  if (isMajorCardId(choice)) return { kind: 'major', id: choice }
  if (getMinorImprovement(choice)) return { kind: 'minor', id: choice }
  return { kind: null, id: choice }
}

export const getMinorImprovementBaseCost = (
  improvementId: string,
) => {
  const improvement = getMinorImprovement(improvementId)
  if (!improvement) return null
  return { ...improvement.cost }
}

export const getMinorImprovementEffectiveCost = (
  _player: PlayerState,
  improvement: ResolvedMinorImprovement,
) => {
  if (improvement.altCosts && improvement.altCosts.length > 0) {
    return { fees: improvement.altCosts } as ComplexCost
  }
  return getMinorImprovementBaseCost(improvement.id) ?? improvement.cost ?? {}
}

export const getPositiveResourceLog = (
  resources?: Partial<Resource> | null,
): Partial<Resource> | undefined => {
  if (!resources) return undefined
  const positiveEntries = Object.entries(resources).filter(
    ([, amount]) => (amount ?? 0) > 0,
  )
  if (positiveEntries.length === 0) return undefined
  return Object.fromEntries(positiveEntries) as Partial<Resource>
}

export const buildImprovementLogParams = (
  improvementId: string,
  costResources: NonNullable<PaymentInfo['resourcesPaid']>,
  options?: {
    returnedCards?: string[]
    bonusSources?: string[]
  },
) => {
  const params: Record<string, unknown> = {
    improvements: improvementId,
    costResources: getPositiveResourceLog(costResources) ?? {},
  }
  if (options?.returnedCards && options.returnedCards.length > 0) {
    params.returnedCards = options.returnedCards
  }
  if (options?.bonusSources && options.bonusSources.length > 0) {
    params.bonusSources = [...options.bonusSources]
  }
  return params
}

/**
 * Read-only snapshot of the session-transient bonus-source scratchpad
 * populated by `executePaymentSolution` during this action. Returned as a
 * copy so callers can embed it in log params without capturing a live
 * reference.
 */
export const readActionBonusSources = (player: PlayerState): string[] | undefined => {
  const sources = player._activeActionBonusSources
  if (!sources || sources.length === 0) return undefined
  return [...sources]
}

type ImprovementLogKind = 'major' | 'minor'

export const buildImprovementImmediateLogs = (
  kind: ImprovementLogKind,
  improvementId: string,
  costResources: NonNullable<PaymentInfo['resourcesPaid']>,
  options?: {
    returnedCards?: string[]
    bonusSources?: string[]
  },
) => [
  {
    key: kind === 'major' ? 'log.playImprovement' : 'log.playMinorImprovement',
    params: buildImprovementLogParams(improvementId, costResources, options),
  },
]

const attachRequiredReturnCards = (
  cost: Partial<PlayerState['resources']> | ComplexCost | null,
  returnCards?: string[],
) => {
  if (!cost || !returnCards || returnCards.length === 0) {
    return cost
  }
  if (PaymentSolver.isComplexCost(cost)) {
    return {
      ...cost,
      cards: {
        type: 'Major',
        list: returnCards,
        required: true,
      },
    } as ComplexCost
  }
  return {
    fee: cost,
    cards: {
      type: 'Major',
      list: returnCards,
      required: true,
    },
  } as ComplexCost
}

export const getMajorImprovementPreviewCost = (
  state: GameState,
  player: PlayerState,
  improvementId: string,
  actionCardId?: string,
) => {
  return resolveCardPreviewCostByProvider(
    state,
    player,
    'improvement-any',
    improvementId,
    () => getMajorCard(improvementId)?.cost ?? null,
    actionCardId,
  )
}

export const getMinorImprovementPreviewCost = (
  state: GameState,
  player: PlayerState,
  improvementId: string,
  actionCardId?: string,
) => {
  const improvement = getMinorImprovement(improvementId)
  if (!improvement) return null
  const previewCost = resolveCardPreviewCostByProvider(
    state,
    player,
    'improvement-any',
    improvementId,
    () => getMinorImprovementEffectiveCost(player, improvement),
    actionCardId,
  )
  return attachRequiredReturnCards(previewCost, improvement.returnCards)
}

export const canAffordMajorImprovement = (
  state: GameState,
  player: PlayerState,
  improvementId: string,
  actionCardId?: string,
) => {
  const previewCost = getMajorImprovementPreviewCost(state, player, improvementId, actionCardId)
  if (!previewCost) return false
  const rawIndex = state.players.indexOf(player)
  const effectiveState = rawIndex >= 0 ? state : { ...state, players: [player] }
  const playerIndex = rawIndex >= 0 ? rawIndex : 0
  const ctx: PaymentCtx = {
    actionId: 'improvement-major',
    costType: 'none',
    sourceCard: improvementId,
    playedCards: getPlayedCardsForCost(player, previewCost),
  }
  return PaymentSolver.canAfford(effectiveState, playerIndex, previewCost, ctx)
}

export const isMajorImprovementPlayable = (
  state: GameState,
  player: PlayerState,
  improvementId: string,
  actionCardId = 'improvement-any',
  allowedPurchases?: string[],
) => {
  if (allowedPurchases && !allowedPurchases.includes(improvementId)) {
    return false
  }
  return canAffordMajorImprovement(state, player, improvementId, actionCardId)
}

export const canAffordMinorImprovement = (
  state: GameState,
  player: PlayerState,
  improvement: ResolvedMinorImprovement,
  actionCardId?: string,
) => {
  const previewCost = getMinorImprovementPreviewCost(
    state,
    player,
    improvement.id,
    actionCardId,
  )
  if (!previewCost) return false
  const rawIndex = state.players.indexOf(player)
  const effectiveState = rawIndex >= 0 ? state : { ...state, players: [player] }
  const playerIndex = rawIndex >= 0 ? rawIndex : 0
  const ctx: PaymentCtx = {
    actionId: 'improvement-minor',
    costType: 'none',
    sourceCard: improvement.id,
    playedCards: getPlayedCardsForCost(player, previewCost),
  }
  return PaymentSolver.canAfford(effectiveState, playerIndex, previewCost, ctx)
}

export const isMinorImprovementPlayable = (
  state: GameState,
  player: PlayerState,
  improvementId: string,
  actionCardId = 'minor-improvement',
  allowedPurchases?: string[],
) => {
  const improvement = getMinorImprovement(improvementId)
  if (!improvement || !player.minorHand.includes(improvement.id)) return false
  if (allowedPurchases && !allowedPurchases.includes(improvement.id)) {
    return false
  }
  if (!meetsCardPrerequisites(player, improvement, state.round, state)) return false
  if (isBlockedByMajorImprovementActionGate(improvement, actionCardId)) return false
  return canAffordMinorImprovement(state, player, improvement, actionCardId)
}

export const buildPlayableMinorOptions = (
  state: GameState,
  player: PlayerState,
  actionCardId = 'minor-improvement',
) =>
  player.minorHand
    .map((id) => getMinorImprovement(id))
    .filter(
      (improvement): improvement is ResolvedMinorImprovement =>
        !!improvement,
    )
    .filter((improvement) => meetsCardPrerequisites(player, improvement, state.round, state))
    .filter((improvement) => !isBlockedByMajorImprovementActionGate(improvement, actionCardId))
    .filter((improvement) =>
      canAffordMinorImprovement(state, player, improvement, actionCardId),
    )
    .map((improvement) => ({
      value: improvement.id,
      labelKey: `minorImprovements.${improvement.id}.name`,
    }))

export const buildMajorImprovementOptions = (
  available: string[],
  state: GameState,
  player: PlayerState,
  actionCardId = 'improvement-any',
  allowedPurchases?: string[],
) =>
  majorCardDefinitions
    .filter((improvement) => available.includes(improvement.id))
    .filter((improvement) =>
      !allowedPurchases || allowedPurchases.includes(improvement.id),
    )
    .filter((improvement) =>
      canAffordMajorImprovement(state, player, improvement.id, actionCardId),
    )
    .map((improvement) => ({
      value: `major:${improvement.id}`,
      labelKey: `improvements.${improvement.id}.name`,
    }))

export const buildMinorImprovementOptions = (
  state: GameState,
  player: PlayerState,
  actionCardId = 'improvement-any',
  allowedPurchases?: string[],
) =>
  player.minorHand
    .map((id) => getMinorImprovement(id))
    .filter(
      (improvement): improvement is ResolvedMinorImprovement =>
        !!improvement,
    )
    .filter((improvement) => meetsCardPrerequisites(player, improvement, state.round, state))
    .filter((improvement) =>
      !allowedPurchases || allowedPurchases.includes(improvement.id),
    )
    .filter((improvement) => !isBlockedByMajorImprovementActionGate(improvement, actionCardId))
    .filter((improvement) =>
      canAffordMinorImprovement(state, player, improvement, actionCardId),
    )
    .map((improvement) => ({
      value: `minor:${improvement.id}`,
      labelKey: `minorImprovements.${improvement.id}.name`,
    }))

/**
 * Affordability probe for listener-injected improvement candidates.
 * Recognises `major:Major_X` / `minor:E78_Y` prefixes plus bare ids; falls
 * back to whichever side resolves the id.
 */
export const canAffordInjectedImprovement = (
  state: GameState,
  player: PlayerState,
  rawValue: string,
): boolean => {
  const parsed = parseImprovementChoice(rawValue)
  if (parsed.kind === 'major') {
    return canAffordMajorImprovement(state, player, parsed.id, 'minor-improvement')
  }
  if (parsed.kind === 'minor') {
    const minor = getMinorImprovement(parsed.id)
    if (!minor) return false
    return canAffordMinorImprovement(state, player, minor, 'minor-improvement')
  }
  if (isMajorCardId(parsed.id)) {
    return canAffordMajorImprovement(state, player, parsed.id, 'minor-improvement')
  }
  const minor = getMinorImprovement(parsed.id)
  if (minor) {
    return canAffordMinorImprovement(state, player, minor, 'minor-improvement')
  }
  return false
}
