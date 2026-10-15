import type { ActionHookRegistry } from '../hooks'
import type { ComplexCost, ExactCost, GameState, PaymentResourceMap, PlayerState, ResourceKey } from '../../contract/types'
import type { PaymentInfo } from '../../cards/card-effects'
import { getMinorImprovement } from '../../cards/registry-display'
import { CardPurchasePayment, PaymentSolver } from '../payment'
import type { CardPurchasePreview } from '../payment'
import { majorCardDefinitions, getMajorCard } from '../../cards/major'
import { meetsCardPrerequisites } from '../../cards/helpers/prerequisites'
import { isFireplaceIdentityCard, isMajorCardId } from '../../cards/helpers/card-type'
import type { ImprovementType } from '../effects/improvement'
import { requireActiveCardRegistry } from '../../cards/active-registry'
import {
  getAvailableMajorImprovementIds,
  isMajorImprovementAvailable,
  takeMajorImprovementFromSupply,
} from '../../cards/major/supply'

type ResolvedMinorImprovement = NonNullable<ReturnType<typeof getMinorImprovement>>
export type { ResolvedMinorImprovement }
type ResolvedCardCostWithMetadata = CardPurchasePreview

export const isMinorImprovementEligibleForAction = (
  improvement: ResolvedMinorImprovement | undefined,
  types?: readonly ImprovementType[],
  trueAction?: boolean,
): boolean => {
  if (!improvement) return false
  const grantedTypes = types ?? ['major', 'minor']
  return improvement.mustBePlayedViaMajorImprovementAction
    ? grantedTypes.includes('major') && trueAction !== false
    : grantedTypes.includes('minor')
}

export const canPlayMajor = (
  state: GameState,
  improvementId: string,
  allowedPurchases?: string[],
): boolean => {
  if (!isMajorImprovementAvailable(state, improvementId)) return false
  if (allowedPurchases && !allowedPurchases.includes(improvementId)) return false
  return true
}

export const canPlayMinor = (
  state: GameState,
  player: PlayerState,
  improvementId: string,
  types?: readonly ImprovementType[],
  allowedPurchases?: string[],
  trueAction?: boolean,
): boolean => {
  const improvement = getMinorImprovement(improvementId)
  if (!improvement) return false
  if (!player.minorHand.includes(improvement.id)) return false
  if (allowedPurchases && !allowedPurchases.includes(improvement.id)) return false
  if (!meetsCardPrerequisites(player, improvement, state.round, state)) return false
  if (!isMinorImprovementEligibleForAction(improvement, types, trueAction)) return false
  return true
}

export const listAvailableMajors = (state: GameState): string[] =>
  getAvailableMajorImprovementIds(state)

export const listMinorHand = (player: PlayerState): string[] => [...player.minorHand]

export const removeMajorFromPool = (state: GameState, improvementId: string): void => {
  takeMajorImprovementFromSupply(state, improvementId)
}

export const removeMinorFromHand = (player: PlayerState, improvementId: string): void => {
  player.minorHand = player.minorHand.filter((id) => id !== improvementId)
}

export const getFireplaceReturnPool = (player: PlayerState): string[] => [
  ...player.improvements.filter(isFireplaceIdentityCard),
  ...player.minorPlayed.filter(isFireplaceIdentityCard),
]

export const parseImprovementChoice = (choice: string): { kind: 'major' | 'minor' | null; id: string } => {
  if (choice.startsWith('major:')) {
    return { kind: 'major', id: choice.replace('major:', '') }
  }
  if (choice.startsWith('minor:')) {
    return { kind: 'minor', id: choice.replace('minor:', '') }
  }
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

const readBaseCostCandidates = (
  cost: PaymentResourceMap | PaymentResourceMap[] | ComplexCost | null | undefined,
): PaymentResourceMap[] => {
  if (!cost) return []
  if (Array.isArray(cost)) return cost
  if (PaymentSolver.isComplexCost(cost)) {
    if (cost.fees && cost.fees.length > 0) return cost.fees
    return cost.fee ? [cost.fee] : []
  }
  return [cost]
}

export const getPrintedImprovementResourceCost = (
  improvementId: string,
  resource: ResourceKey,
): number => {
  const minor = getMinorImprovement(improvementId)
  const candidates = minor
    ? [
        ...readBaseCostCandidates(minor.cost),
        ...(minor.altCosts ?? []),
      ]
    : readBaseCostCandidates(getMajorCard(improvementId)?.cost)
  return Math.max(0, ...candidates.map((cost) => cost[resource] ?? 0))
}

export const getPrintedImprovementCostCandidates = (
  state: GameState,
  player: PlayerState,
  improvementId: string,
): PaymentResourceMap[] => {
  const dynamicCost = requireActiveCardRegistry('getPrintedImprovementCostCandidates').getBaseCosts(improvementId)?.({
    state,
    player,
    cardId: improvementId,
    actionId: 'improvement',
  })
  if (dynamicCost != null) return readBaseCostCandidates(dynamicCost)

  const minor = getMinorImprovement(improvementId)
  return minor
    ? [
        ...readBaseCostCandidates(minor.cost),
        ...(minor.altCosts ?? []),
      ]
    : readBaseCostCandidates(getMajorCard(improvementId)?.cost)
}

export const getMinorImprovementEffectiveCost = (
  state: GameState,
  player: PlayerState,
  improvement: ResolvedMinorImprovement,
  actionCardId?: string,
) => {
  const getBaseCosts = requireActiveCardRegistry('getMinorImprovementEffectiveCost').getBaseCosts(improvement.id)
  const dynamicBaseCost = getBaseCosts?.({
    state,
    player,
    cardId: improvement.id,
    actionId: 'improvement',
    actionCardId,
  })
  if (Array.isArray(dynamicBaseCost)) {
    return { fees: dynamicBaseCost } as ComplexCost
  }
  if (dynamicBaseCost) {
    return dynamicBaseCost
  }
  if (improvement.altCosts && improvement.altCosts.length > 0) {
    return { fees: improvement.altCosts } as ComplexCost
  }
  return getMinorImprovementBaseCost(improvement.id) ?? improvement.cost ?? {}
}

export const getPositiveResourceLog = (
  resources?: PaymentResourceMap | null,
): PaymentResourceMap | undefined => {
  if (!resources) return undefined
  const positiveEntries = Object.entries(resources).filter(
    ([, amount]) => (amount ?? 0) > 0,
  )
  if (positiveEntries.length === 0) return undefined
  return Object.fromEntries(positiveEntries) as PaymentResourceMap
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
  cost: PaymentResourceMap | ComplexCost | null,
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
  actionHooks?: ActionHookRegistry,
) => {
  return CardPurchasePayment.resolvePreviewCostByProvider(
    state,
    player,
    'improvement',
    improvementId,
    () => getMajorCard(improvementId)?.cost ?? null,
    actionCardId,
    actionHooks,
  )?.cost ?? null
}

export const getMajorImprovementPreviewCostDetailed = (
  state: GameState,
  player: PlayerState,
  improvementId: string,
  actionCardId?: string,
  exactCost?: ExactCost,
  actionHooks?: ActionHookRegistry,
): ResolvedCardCostWithMetadata | null => {
  return CardPurchasePayment.resolvePreviewCostByProvider(
    state,
    player,
    'improvement',
    improvementId,
    () => exactImprovementCost(getMajorCard(improvementId)?.cost ?? null, exactCost),
    actionCardId,
    actionHooks,
  )
}

const exactImprovementCost = (cost: PaymentResourceMap | ComplexCost | null, exactCost?: ExactCost): PaymentResourceMap | ComplexCost | null => {
  if (!cost || !exactCost) return cost
  const fee = PaymentSolver.resolveExactUnitCost(exactCost, 1)
  if (!fee) return null
  if (!PaymentSolver.isComplexCost(cost)) return fee
  return { ...cost, fee: undefined, unitFee: undefined, fees: (cost.fees ?? [cost.fee ?? {}]).map(() => ({ ...fee })) }
}

export const getMinorImprovementPreviewCost = (
  state: GameState,
  player: PlayerState,
  improvementId: string,
  actionCardId?: string,
  actionHooks?: ActionHookRegistry,
) => {
  const improvement = getMinorImprovement(improvementId)
  if (!improvement) return null
  const previewCost = CardPurchasePayment.resolvePreviewCostByProvider(
    state,
    player,
    'improvement',
    improvementId,
    () => getMinorImprovementEffectiveCost(state, player, improvement, actionCardId),
    actionCardId,
    actionHooks,
  )
  return attachRequiredReturnCards(previewCost?.cost ?? null, improvement.returnCards)
}

export const getMinorImprovementPreviewCostDetailed = (
  state: GameState,
  player: PlayerState,
  improvementId: string,
  actionCardId?: string,
  exactCost?: ExactCost,
  actionHooks?: ActionHookRegistry,
): ResolvedCardCostWithMetadata | null => {
  const improvement = getMinorImprovement(improvementId)
  if (!improvement) return null
  const previewCost = CardPurchasePayment.resolvePreviewCostByProvider(
    state,
    player,
    'improvement',
    improvementId,
    () => exactImprovementCost(getMinorImprovementEffectiveCost(state, player, improvement, actionCardId), exactCost),
    actionCardId,
    actionHooks,
  )
  if (!previewCost) return null
  return {
    ...previewCost,
    cost: attachRequiredReturnCards(previewCost.cost, improvement.returnCards) ?? {},
  }
}

export const canAffordMajorImprovement = (
  state: GameState,
  player: PlayerState,
  improvementId: string,
  actionCardId?: string,
  exactCost?: ExactCost,
  actionHooks?: ActionHookRegistry,
) => {
  const previewCost = getMajorImprovementPreviewCostDetailed(state, player, improvementId, actionCardId, exactCost, actionHooks)
  if (!previewCost) return false
  const rawIndex = state.players.indexOf(player)
  return CardPurchasePayment.hasPaymentOption({
    state,
    playerIndex: rawIndex,
    player,
    kind: 'major',
    cardId: improvementId,
    preview: previewCost,
  })
}

export const isMajorImprovementPlayable = (
  state: GameState,
  player: PlayerState,
  improvementId: string,
  actionCardId = 'improvement',
  allowedPurchases?: string[],
  actionHooks?: ActionHookRegistry,
) => {
  if (!canPlayMajor(state, improvementId, allowedPurchases)) return false
  return canAffordMajorImprovement(state, player, improvementId, actionCardId, undefined, actionHooks)
}

export const canAffordMinorImprovement = (
  state: GameState,
  player: PlayerState,
  improvement: ResolvedMinorImprovement,
  actionCardId?: string,
  exactCost?: ExactCost,
  actionHooks?: ActionHookRegistry,
) => {
  const previewCost = getMinorImprovementPreviewCostDetailed(
    state,
    player,
    improvement.id,
    actionCardId,
    exactCost,
    actionHooks,
  )
  if (!previewCost) return false
  const rawIndex = state.players.indexOf(player)
  return CardPurchasePayment.hasPaymentOption({
    state,
    playerIndex: rawIndex,
    player,
    kind: 'minor',
    cardId: improvement.id,
    preview: previewCost,
  })
}

export const isMinorImprovementPlayable = (
  state: GameState,
  player: PlayerState,
  improvementId: string,
  actionCardId = 'improvement',
  allowedPurchases?: string[],
  types?: readonly ImprovementType[],
  trueAction?: boolean,
  actionHooks?: ActionHookRegistry,
) => {
  const improvement = getMinorImprovement(improvementId)
  if (!improvement || !player.minorHand.includes(improvement.id)) return false
  if (allowedPurchases && !allowedPurchases.includes(improvement.id)) {
    return false
  }
  if (!meetsCardPrerequisites(player, improvement, state.round, state)) return false
  if (!isMinorImprovementEligibleForAction(improvement, types, trueAction)) return false
  return canAffordMinorImprovement(state, player, improvement, actionCardId, undefined, actionHooks)
}

export const buildPlayableMinorOptions = (
  state: GameState,
  player: PlayerState,
  actionCardId = 'improvement',
  types?: readonly ImprovementType[],
  exactCost?: ExactCost,
  trueAction?: boolean,
  actionHooks?: ActionHookRegistry,
) =>
  player.minorHand
    .map((id) => getMinorImprovement(id))
    .filter(
      (improvement): improvement is ResolvedMinorImprovement =>
        !!improvement,
    )
    .filter((improvement) => meetsCardPrerequisites(player, improvement, state.round, state))
    .filter((improvement) => isMinorImprovementEligibleForAction(improvement, types, trueAction))
    .filter((improvement) =>
      canAffordMinorImprovement(state, player, improvement, actionCardId, exactCost, actionHooks),
    )
    .map((improvement) => ({
      value: improvement.id,
      labelKey: `minorImprovements.${improvement.id}.name`,
    }))

export const buildMajorImprovementOptions = (
  state: GameState,
  player: PlayerState,
  actionCardId = 'improvement',
  allowedPurchases?: string[],
  exactCost?: ExactCost,
  actionHooks?: ActionHookRegistry,
) =>
  majorCardDefinitions
    .filter((improvement) => isMajorImprovementAvailable(state, improvement.id))
    .filter((improvement) =>
      !allowedPurchases || allowedPurchases.includes(improvement.id),
    )
    .filter((improvement) =>
      canAffordMajorImprovement(state, player, improvement.id, actionCardId, exactCost, actionHooks),
    )
    .map((improvement) => ({
      value: improvement.id,
      labelKey: `improvements.${improvement.id}.name`,
    }))

export const buildMinorImprovementOptions = (
  state: GameState,
  player: PlayerState,
  actionCardId = 'improvement',
  allowedPurchases?: string[],
  types?: readonly ImprovementType[],
  exactCost?: ExactCost,
  trueAction?: boolean,
  actionHooks?: ActionHookRegistry,
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
    .filter((improvement) => isMinorImprovementEligibleForAction(improvement, types, trueAction))
    .filter((improvement) =>
      canAffordMinorImprovement(state, player, improvement, actionCardId, exactCost, actionHooks),
    )
    .map((improvement) => ({
      value: improvement.id,
      labelKey: `minorImprovements.${improvement.id}.name`,
    }))

export const canAffordInjectedImprovement = (
  state: GameState,
  player: PlayerState,
  rawValue: string,
  actionCardId = 'minor-improvement',
  exactCost?: ExactCost,
  actionHooks?: ActionHookRegistry,
): boolean => {
  const parsed = parseImprovementChoice(rawValue)
  if (parsed.kind === 'major') {
    return canAffordMajorImprovement(state, player, parsed.id, actionCardId, exactCost, actionHooks)
  }
  if (parsed.kind === 'minor') {
    const minor = getMinorImprovement(parsed.id)
    if (!minor) return false
    return canAffordMinorImprovement(state, player, minor, actionCardId, exactCost, actionHooks)
  }
  if (isMajorCardId(parsed.id)) {
    return canAffordMajorImprovement(state, player, parsed.id, actionCardId, exactCost, actionHooks)
  }
  const minor = getMinorImprovement(parsed.id)
  if (minor) {
    return canAffordMinorImprovement(state, player, minor, actionCardId, exactCost, actionHooks)
  }
  return false
}
