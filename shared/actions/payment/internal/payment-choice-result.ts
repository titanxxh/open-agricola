/**
 * Choice request constructors: buildPaymentChoiceResult,
 * resolvePaymentSolutionSelection, resolveCostPaymentSelection. Glue between
 * PaymentSolver options and the engine's ActionExecutionResult choice
 * mechanism. Builds the choice prompt that effect layer surfaces to the
 * player when length > 1; resolves the selection on the way back.
 *
 * Internal to shared/actions/payment/. Not exported from the package
 * barrel (shared/actions/payment/index.ts). Use PaymentSolver from
 * the public API instead.
 */

import type {
  ActionExecutionResult,
  ChoiceDescriptionPreview,
  CardCostCandidateMetadata,
  CardProvidedPaymentResourceProvider,
  ComplexCost,
  CostModifierType,
  GameState,
  PaymentResourceMap,
  PaymentSolution,
  PlayerState,
  Resource,
  ResourceReserve,
} from '../../../contract/types'
import type { PurchaseOutcomeRule } from '../../../contract/rule-plans'
import { describePurchaseOutcome } from '../../purchase-outcome'
import { isComplexCost } from './affordability'
import { computeAllBuyableCombinations, sortPaymentSolutions } from './enumerate'

const collectPaymentSolutionSources = (
  solution: PaymentSolution,
  extraSources: readonly string[] = [],
  paymentResourceProviders: readonly CardProvidedPaymentResourceProvider[] = [],
): string[] => {
  const sources: string[] = []
  const seen = new Set<string>()
  const add = (id: string | undefined) => {
    if (!id) return
    const trimmed = id.trim()
    if (!trimmed || seen.has(trimmed)) return
    seen.add(trimmed)
    sources.push(trimmed)
  }
  if (solution.bonusUsed) {
    solution.bonusUsed.split(',').forEach(add)
  }
  solution.tradesUsed.forEach(({ trade }) => {
    if (trade.sourceId) add(trade.sourceId)
  })
  paymentResourceProviders.forEach((provider) => {
    if ((solution.resourcesPaid[provider.key] ?? 0) > 0) add(provider.sourceCard)
  })
  extraSources.forEach(add)
  return sources
}

type PaymentChoiceResultOptions = {
  purchaseOutcome?: { state: GameState; player: PlayerState; cardId: string; paymentPaths: readonly PurchaseOutcomeRule[]; metadata?: Record<number, CardCostCandidateMetadata> }
  extraSourcesForSolution?: (solution: PaymentSolution) => readonly string[]
  paymentResourceProviders?: readonly CardProvidedPaymentResourceProvider[]
}

const describePaymentSolution = (
  solution: PaymentSolution,
  includeReturnedCard: boolean,
  options: PaymentChoiceResultOptions = {},
): Record<string, unknown> => {
  const sourceCards = collectPaymentSolutionSources(
    solution,
    options.extraSourcesForSolution?.(solution) ?? [],
    options.paymentResourceProviders,
  )
  return {
    resourcesPaid: solution.resourcesPaid,
    cardUsed: includeReturnedCard && solution.cardUsed ? solution.cardUsed : undefined,
    sourceCards: sourceCards.length > 0 ? sourceCards : undefined,
  }
}

const describePaymentEffectPreview = (
  solution: PaymentSolution,
  includeReturnedCard: boolean,
  options: PaymentChoiceResultOptions = {},
) => {
  const sourceCards = collectPaymentSolutionSources(
    solution,
    options.extraSourcesForSolution?.(solution) ?? [],
    options.paymentResourceProviders,
  )
  return {
    kind: 'payment' as const,
    resourcesPaid: solution.resourcesPaid,
    cardUsed: includeReturnedCard && solution.cardUsed ? solution.cardUsed : undefined,
    sourceCards: sourceCards.length > 0 ? sourceCards : undefined,
  }
}

const describePaymentOutcome = (solution: PaymentSolution, includeReturnedCard: boolean, options: PaymentChoiceResultOptions): ChoiceDescriptionPreview | undefined => {
  const context = options.purchaseOutcome
  if (!context) return undefined
  const feeIndex = solution.feeIndex
  const originalIndex = (feeIndex === undefined ? undefined : context.metadata?.[feeIndex]?.originalFeeIndex) ?? feeIndex
  const rule = originalIndex === undefined ? undefined : context.paymentPaths[originalIndex]
  if (!rule) return undefined
  const outcome = describePurchaseOutcome(context.state, context.player, context.cardId, rule)
  if (!outcome) return undefined
  return { kind: 'group', separator: ' → ', parts: [
    { kind: 'action', labelKey: 'actions.pay.name', showLabel: false, effectPreview: describePaymentEffectPreview(solution, includeReturnedCard, options) },
    outcome,
  ] }
}

export const preservesResourceReserve = (
  resources: Partial<Resource>,
  resourcesPaid: Partial<Resource>,
  reserveResources: Partial<Resource> | undefined,
) => {
  if (!reserveResources) return true
  return Object.entries(reserveResources).every(([rawKey, rawMinimum]) => {
    if (typeof rawMinimum !== 'number' || rawMinimum <= 0) return true
    const key = rawKey as keyof Resource
    return (resources[key] ?? 0) - (resourcesPaid[key] ?? 0) >= rawMinimum
  })
}

export const filterPaymentSolutionsByReserve = (
  player: PlayerState,
  solutions: PaymentSolution[],
  reserveResources: Partial<Resource> | undefined,
  resourceReserve?: ResourceReserve,
) =>
  solutions.filter((solution) =>
    preservesResourceReserve(
      player.resources,
      solution.resourcesPaid,
      reserveResources,
    ) && (
      !resourceReserve || resourceReserve.resources.reduce(
        (total, resource) => total
          + (player.resources[resource] ?? 0)
          - (solution.resourcesPaid[resource] ?? 0),
        0,
      ) >= resourceReserve.minimum
    ),
  )

const canonicalPaymentData = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalPaymentData)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalPaymentData(child)]))
  }
  return value
}

const fnv1a = (text: string, seed: number): string => {
  let hash = seed
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

/**
 * Identity of one offered payment, carried in its option value. Resources or
 * provider supplies can change while a menu is open (for example through an
 * anytime action), so the submitted option is matched by identity, never by
 * its old position in a recomputed list.
 */
const paymentSolutionIdentity = (solution: PaymentSolution): string => {
  const resourcesPaid = Object.fromEntries(Object.entries(solution.resourcesPaid)
    .filter(([, amount]) => amount !== undefined && amount !== 0))
  const text = JSON.stringify(canonicalPaymentData({ ...solution, resourcesPaid }))
  return `${fnv1a(text, 0x811c9dc5)}${fnv1a(text, 0x050c5d1f)}`
}

const PAYMENT_IDENTITY_SEPARATOR = '~'

export const buildPaymentChoiceResult = (
  solutions: PaymentSolution[],
  optionValuePrefix: string,
  includeReturnedCard = false,
  choiceOptions: PaymentChoiceResultOptions = {},
): ActionExecutionResult => {
  const orderedSolutions = sortPaymentSolutions(solutions)
  const options = orderedSolutions.map((solution, idx) => ({
    value: `${optionValuePrefix}:${idx}${PAYMENT_IDENTITY_SEPARATOR}${paymentSolutionIdentity(solution)}`,
    labelKey: 'prompt.selectPaymentOption',
    labelParams: describePaymentSolution(
      solution,
      includeReturnedCard,
      choiceOptions,
    ) as unknown as Record<string, string | number>,
    effectPreview: describePaymentEffectPreview(solution, includeReturnedCard, choiceOptions),
    descriptionPreview: describePaymentOutcome(solution, includeReturnedCard, choiceOptions),
  }))
  return {
    type: 'request',
    request: { kind: 'choice', options },
    promptKey: 'prompt.selectPayment',
  }
}

export const resolvePaymentSolutionSelection = (
  solutions: PaymentSolution[],
  paymentChoice: string | undefined,
  optionValuePrefix: string,
  includeReturnedCard: boolean,
  failure: ActionExecutionResult,
  options: PaymentChoiceResultOptions = {},
):
  | ActionExecutionResult
  | { type: 'selected'; solution: PaymentSolution } => {
  const orderedSolutions = sortPaymentSolutions(solutions)
  // A submitted choice is checked first: even when no payment remains
  // affordable, it is rejected recoverably and the issued menu is kept.
  if (paymentChoice !== undefined) {
    const [indexPart, identity] = paymentChoice.split(PAYMENT_IDENTITY_SEPARATOR)
    const atIndex = orderedSolutions[parseInt(indexPart!, 10)]
    // An issued option names its payment; a choice whose payment is no longer
    // available fails instead of settling whatever now sits at that index.
    const solution = identity === undefined || (atIndex && paymentSolutionIdentity(atIndex) === identity)
      ? atIndex
      : orderedSolutions.find((candidate) => paymentSolutionIdentity(candidate) === identity)
    if (!solution) {
      // Keep the issued menu so the player can choose a payment that still exists.
      return failure.type === 'fail' ? { ...failure, recoverable: true } : failure
    }
    return { type: 'selected', solution }
  }

  if (orderedSolutions.length === 0) {
    return failure
  }

  if (orderedSolutions.length === 1) {
    return { type: 'selected', solution: orderedSolutions[0] }
  }

  return buildPaymentChoiceResult(
    orderedSolutions,
    optionValuePrefix,
    includeReturnedCard,
    options,
  )
}

const normalizePaymentChoiceValue = (
  paymentChoice: string | undefined,
  optionValuePrefix: string,
) => {
  if (!paymentChoice) return undefined
  const prefix = `${optionValuePrefix}:`
  return paymentChoice.startsWith(prefix)
    ? paymentChoice.slice(prefix.length)
    : paymentChoice
}

type ResolveCostPaymentSelectionOptions = {
  costType?: CostModifierType
  includeReturnedCard?: boolean
  playedCards?: string[]
  state?: GameState
  reserveResources?: Partial<Resource>
  extraSourcesForSolution?: (solution: PaymentSolution) => readonly string[]
  paymentResourceProviders?: readonly CardProvidedPaymentResourceProvider[]
}

export const resolveCostPaymentSelection = (
  player: PlayerState,
  cost: PaymentResourceMap | ComplexCost,
  optionValuePrefix: string,
  paymentChoice: string | undefined,
  failure: ActionExecutionResult,
  options: ResolveCostPaymentSelectionOptions = {},
):
  | ActionExecutionResult
  | {
      type: 'selected'
      solution: PaymentSolution
    } => {
  const normalizedCost = isComplexCost(cost)
    ? cost
    : { fee: cost }
  const solutions = filterPaymentSolutionsByReserve(
    player,
    computeAllBuyableCombinations(
      player,
      normalizedCost,
      options.playedCards,
      options.costType,
      options.state,
    ),
    options.reserveResources,
    isComplexCost(cost) ? cost.resourceReserve : undefined,
  )
  return resolvePaymentSolutionSelection(
    solutions,
    normalizePaymentChoiceValue(paymentChoice, optionValuePrefix),
    optionValuePrefix,
    options.includeReturnedCard ?? false,
    failure,
    {
      extraSourcesForSolution: options.extraSourcesForSolution,
      paymentResourceProviders: options.paymentResourceProviders ?? normalizedCost.paymentResourceProviders,
    },
  )
}
