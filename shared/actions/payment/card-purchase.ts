import type {
  ActionExecutionResult,
  CardCostCandidateMetadata,
  ComplexCost,
  CostModifierType,
  GameState,
  PaymentResourceMap,
  PlayerState,
} from '../../contract/types'
import type { PaymentInfo } from '../../cards/card-effects'
import { isCookingHearthIdentityCard, isFireplaceIdentityCard } from '../../cards/helpers/card-type'
import { recordCardCostAttribution } from '../../cards/helpers/card-state'
import { PaymentSolver } from './solver'
import type { Cost, PaymentCtx, PaymentReceipt } from './types'

export type CardPurchaseKind = 'major' | 'minor'

export type CardPurchasePreview = {
  cost: Cost
  candidateMetadataByFeeIndex?: Record<number, CardCostCandidateMetadata>
}

export type CardPurchasePayParams = {
  cost: Cost
  costType: CostModifierType
  optionPrefix: string
  includeReturnedCard: boolean
  playedCards: string[]
  candidateMetadataByFeeIndex?: Record<number, CardCostCandidateMetadata>
}

type ResolvePaymentArgs = {
  actionContext?: Record<string, unknown>
  state: GameState
  playerIndex: number
  player: PlayerState
  kind: CardPurchaseKind
  cardId: string
  preview: CardPurchasePreview
  paymentChoice?: string
  optionPrefix?: string
  failure: ActionExecutionResult
}

type PaymentOptionArgs = Omit<ResolvePaymentArgs, 'paymentChoice' | 'optionPrefix' | 'failure'>

export type CardPurchaseSelectedPayment = {
  type: 'selected'
  paymentInfo: PaymentInfo
}

const costType = (kind: CardPurchaseKind): CostModifierType =>
  kind === 'major' ? 'major-improvement' : 'minor-improvement'

const actionId = (kind: CardPurchaseKind) =>
  kind === 'major' ? 'improvement-major' : 'improvement-minor'

const directOptionPrefix = (kind: CardPurchaseKind, cardId: string): string =>
  kind === 'major' ? `pay:${cardId}` : `pay:minor:${cardId}`

const flowOptionPrefix = (kind: CardPurchaseKind, cardId: string): string =>
  kind === 'major' ? `pay:improvement:${cardId}` : `pay:improvement:minor:${cardId}`

const includeReturnedCard = (cost: Cost): boolean =>
  PaymentSolver.isComplexCost(cost) && !!cost.cards?.list?.length

const getReturnCardPool = (
  player: PlayerState,
  list: readonly string[],
): string[] => {
  const listed = new Set(list)
  const hasFireplaceSlot = list.some(isFireplaceIdentityCard)
  const hasCookingHearthSlot = list.some(isCookingHearthIdentityCard)
  return [...player.improvements, ...player.minorPlayed].filter((id) =>
    listed.has(id) ||
    (hasFireplaceSlot && isFireplaceIdentityCard(id)) ||
    (hasCookingHearthSlot && isCookingHearthIdentityCard(id)),
  )
}

const getPlayedCards = (
  player: PlayerState,
  cost: PaymentResourceMap | ComplexCost | null,
): string[] => {
  if (!cost || !PaymentSolver.isComplexCost(cost)) return player.improvements
  const list = cost.cards?.list
  if (!Array.isArray(list)) return player.improvements
  return getReturnCardPool(player, list)
}

const paymentInfoFromReceipt = (receipt: PaymentReceipt): PaymentInfo => ({
  resourcesPaid: receipt.resourcesPaid,
  ...(receipt.feeIndex !== undefined ? { feeIndex: receipt.feeIndex } : {}),
  ...(receipt.originalFeeIndex !== undefined ? { originalFeeIndex: receipt.originalFeeIndex } : {}),
  ...(receipt.returnedCardId ? { returnedCardId: receipt.returnedCardId } : {}),
})

const buildCtx = (
  player: PlayerState,
  kind: CardPurchaseKind,
  cardId: string,
  preview: CardPurchasePreview,
  paymentChoice?: string,
  optionPrefix = directOptionPrefix(kind, cardId),
  actionContext?: Record<string, unknown>,
): PaymentCtx => ({
  actionContext,
  actionId: actionId(kind),
  costType: 'none',
  sourceCard: cardId,
  playedCards: getPlayedCards(player, preview.cost),
  optionPrefix,
  paymentChoice,
  includeReturnedCard: includeReturnedCard(preview.cost),
  candidateMetadataByFeeIndex: preview.candidateMetadataByFeeIndex,
  paymentResourceProviders: PaymentSolver.isComplexCost(preview.cost)
    ? preview.cost.paymentResourceProviders
    : undefined,
})

const resolvePreviewCostByProvider = (
  state: GameState,
  player: PlayerState,
  actionId: string,
  cardId: string,
  getBaseCost: () => PaymentResourceMap | ComplexCost | null | undefined,
  actionCardId?: string,
): CardPurchasePreview | null =>
  PaymentSolver.resolveCardPreviewCostDetailedByProvider(
    state,
    player,
    actionId,
    cardId,
    getBaseCost,
    actionCardId,
  )

const buildPayParams = (
  player: PlayerState,
  kind: CardPurchaseKind,
  cardId: string,
  preview: CardPurchasePreview,
): CardPurchasePayParams => ({
  cost: preview.cost,
  costType: costType(kind),
  optionPrefix: flowOptionPrefix(kind, cardId),
  includeReturnedCard: includeReturnedCard(preview.cost),
  playedCards: getPlayedCards(player, preview.cost),
  ...(preview.candidateMetadataByFeeIndex
    ? { candidateMetadataByFeeIndex: preview.candidateMetadataByFeeIndex }
    : {}),
})

const hasPaymentOption = (args: PaymentOptionArgs): boolean => {
  const effectiveState = args.playerIndex >= 0 ? args.state : { ...args.state, players: [args.player] }
  const effectiveIndex = args.playerIndex >= 0 ? args.playerIndex : 0
  return PaymentSolver.hasPaymentOption(
    effectiveState,
    effectiveIndex,
    args.preview.cost,
    buildCtx(args.player, args.kind, args.cardId, args.preview),
  )
}

const resolvePayment = (
  args: ResolvePaymentArgs,
): ActionExecutionResult | CardPurchaseSelectedPayment => {
  const effectiveState = args.playerIndex >= 0 ? args.state : { ...args.state, players: [args.player] }
  const effectiveIndex = args.playerIndex >= 0 ? args.playerIndex : 0
  const resolved = PaymentSolver.resolvePayment(
    effectiveState,
    effectiveIndex,
    args.preview.cost,
    buildCtx(
      args.player,
      args.kind,
      args.cardId,
      args.preview,
      args.paymentChoice,
      args.optionPrefix,
      args.actionContext,
    ),
  )
  if (resolved.type === 'request') return resolved.request
  if (resolved.type === 'failed') return args.failure
  recordCardCostAttribution(args.player, resolved.receipt.costAttribution)
  return {
    type: 'selected',
    paymentInfo: paymentInfoFromReceipt(resolved.receipt),
  }
}

export const CardPurchasePayment = {
  resolvePreviewCostByProvider,
  buildPayParams,
  hasPaymentOption,
  resolvePayment,
  getPlayedCards,
} as const
