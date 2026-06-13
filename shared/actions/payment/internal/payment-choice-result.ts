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
  CardProvidedPaymentResourceProvider,
  ComplexCost,
  CostModifierType,
  GameState,
  PaymentResourceMap,
  PaymentSolution,
  PlayerState,
  Resource,
} from '../../../contract/types'
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
) =>
  solutions.filter((solution) =>
    preservesResourceReserve(
      player.resources,
      solution.resourcesPaid,
      reserveResources,
    ),
  )

export const buildPaymentChoiceResult = (
  solutions: PaymentSolution[],
  optionValuePrefix: string,
  includeReturnedCard = false,
  choiceOptions: PaymentChoiceResultOptions = {},
): ActionExecutionResult => {
  const orderedSolutions = sortPaymentSolutions(solutions)
  const options = orderedSolutions.map((solution, idx) => ({
    value: `${optionValuePrefix}:${idx}`,
    labelKey: 'prompt.selectPaymentOption',
    labelParams: describePaymentSolution(
      solution,
      includeReturnedCard,
      choiceOptions,
    ) as unknown as Record<string, string | number>,
    effectPreview: describePaymentEffectPreview(solution, includeReturnedCard, choiceOptions),
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
  if (orderedSolutions.length === 0) {
    return failure
  }

  if (orderedSolutions.length === 1 && paymentChoice === undefined) {
    return { type: 'selected', solution: orderedSolutions[0] }
  }

  if (paymentChoice !== undefined) {
    const choiceIndex = parseInt(paymentChoice, 10)
    const solution = orderedSolutions[choiceIndex]
    if (!solution) {
      return failure
    }
    return { type: 'selected', solution }
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
