import type {
  ActionExecutionResult,
  ActionSpace,
  ActionAvailabilityContext,
  Bonus,
  ComplexCost,
  CostModifier,
  CostModifierType,
  GameState,
  PaymentSolution,
  PlayerState,
  Resource,
  Trade,
} from '../../game/types'
import {
  applyCostOverride,
  canPayCost,
  canPayResources,
  computeAllBuyableCombinations,
  executePaymentSolution,
  getModifiersForCostType,
  isComplexCost,
  payResources,
  sortPaymentSolutions,
} from './pay'
import {
  executeCardListener,
  getMatchingListeners,
  type CardListenerContext,
} from '../../cards/card-listeners'

export const buildCardCostListenerContext = (
  state: GameState,
  player: PlayerState,
  actionId: string,
): CardListenerContext => {
  const emptySpace: ActionSpace = {
    id: '',
    nameKey: '',
    descriptionKey: '',
    roundAvailable: 1,
    gainPerRound: {},
    canBeExecutedByPlayer: () => true,
    execute: () => ({ type: 'ok' as const }),
    resources: {} as Resource,
    takenBy: null,
  }

  return {
    state,
    player,
    space: emptySpace,
    actionId,
    phase: 'computeCosts',
  }
}

export const resolveCardCostWithModifiers = (
  state: GameState,
  player: PlayerState,
  actionId: string,
  cardId: string,
  baseCost: Partial<Resource>,
  actionCardId?: string,
): Partial<Resource> | ComplexCost => {
  const context = buildCardCostListenerContext(state, player, actionId)
  const matched = getMatchingListeners(context)
  let cost = { ...baseCost }
  const collectedBonuses: Bonus[] = []
  const collectedTrades: Trade[] = []

  for (const entry of matched) {
    const listenerContext: CardListenerContext & {
      cardId: string
      actionCardId?: string
    } = {
      ...context,
      cardId,
      actionCardId,
    }
    const result = executeCardListener(entry.registration, listenerContext, {
      ownerPlayerId: entry.ownerPlayerId,
    })
    if (result?.costs) {
      cost = applyCostOverride(cost, result.costs)
    }
    if (result?.bonuses) {
      collectedBonuses.push(...result.bonuses)
    }
    if (result?.trades) {
      collectedTrades.push(...result.trades)
    }
  }

  if (collectedBonuses.length > 0 || collectedTrades.length > 0) {
    const complexCost: ComplexCost = {
      fee: cost,
    }
    if (collectedBonuses.length > 0) {
      complexCost.bonuses = collectedBonuses
    }
    if (collectedTrades.length > 0) {
      complexCost.trades = collectedTrades
    }
    return complexCost
  }

  return cost
}

export const canAffordCost = (
  player: PlayerState,
  cost: Partial<Resource> | ComplexCost | undefined,
) => {
  if (!cost) return true
  return canPayCost(player, cost)
}

export const resolveFlatCost = (
  baseCost: Partial<Resource>,
  costOverride?: Partial<Resource>,
) => applyCostOverride(baseCost, costOverride)

export const canAffordFlatCost = (
  player: PlayerState,
  baseCost: Partial<Resource>,
  costOverride?: Partial<Resource>,
) => canAffordCost(player, resolveFlatCost(baseCost, costOverride))

export const PAYMENT_CHOICE_REQUIRED_ERROR = 'payment choice required'

const getTypedCostModifiers = (
  player: PlayerState,
  costType?: CostModifierType,
) => {
  if (!costType) return []
  return getModifiersForCostType(player, costType)
}

const resolveSimpleTradeAdjustedCost = (
  player: PlayerState,
  baseCost: Partial<Resource>,
  modifiers: CostModifier[],
): Partial<Resource> | null => {
  const fallbackBaseCost: Partial<Resource> | null =
    canPayResources(player, baseCost) ? baseCost : null

  for (const mod of modifiers) {
    if (mod.type !== 'trade') continue
    const fromKeys = Object.keys(mod.from) as (keyof Resource)[]
    const toPositiveKeys = (Object.keys(mod.to) as (keyof Resource)[]).filter(
      (k) => (mod.to[k] ?? 0) > 0,
    )

    // BGA-style "free unit" trades: empty `from`, positive `to` (e.g. A88_HedgeKeeper).
    if (fromKeys.length === 0 && toPositiveKeys.length === 1) {
      const toKey = toPositiveKeys[0]!
      const perUse = mod.to[toKey] ?? 0
      if (perUse <= 0 || (baseCost[toKey] ?? 0) <= 0) continue
      const maxCredit = (mod.max ?? Infinity) * perUse
      const virtualPaid = Math.min(baseCost[toKey] ?? 0, maxCredit)
      const altCost = { ...baseCost }
      altCost[toKey] = Math.max(0, (altCost[toKey] ?? 0) - virtualPaid)
      if (canPayResources(player, altCost)) {
        return altCost
      }
      continue
    }

    const toKey = Object.keys(mod.to)[0] as keyof typeof baseCost
    const fromKey = Object.keys(mod.from)[0] as keyof typeof baseCost
    const toAmount = mod.to[toKey as keyof typeof mod.to] ?? 0
    const fromAmount = mod.from[fromKey as keyof typeof mod.from] ?? 0

    if (toAmount <= 0 || fromAmount <= 0 || (baseCost[toKey] ?? 0) <= 0) {
      continue
    }

    const tradeable = Math.min(baseCost[toKey] ?? 0, mod.max ?? Infinity)
    const altCost = { ...baseCost }
    altCost[toKey] = Math.max(0, (altCost[toKey] ?? 0) - tradeable)
    altCost[fromKey] =
      (altCost[fromKey] ?? 0) + (tradeable * fromAmount / toAmount)

    if (canPayResources(player, altCost)) {
      return altCost
    }
  }

  return fallbackBaseCost
}

const resolveTypedFlatDirectPaymentCost = (
  player: PlayerState,
  baseCost: Partial<Resource>,
  modifiers: CostModifier[],
) => {
  if (modifiers.length === 0) {
    return canPayResources(player, baseCost) ? baseCost : null
  }
  return resolveSimpleTradeAdjustedCost(player, baseCost, modifiers)
}

const resolveTypedFlatPaymentSolution = (
  player: PlayerState,
  baseCost: Partial<Resource>,
  costType?: CostModifierType,
) => {
  const modifiers = getTypedCostModifiers(player, costType)
  const directCost = resolveTypedFlatDirectPaymentCost(
    player,
    baseCost,
    modifiers,
  )

  if (directCost) {
    return {
      type: 'direct' as const,
      directCost,
    }
  }

  if (modifiers.length === 0) {
    return null
  }

  const solution = computeAllBuyableCombinations(
    player,
    { fee: baseCost },
    undefined,
    costType,
  )[0]

  if (!solution) return null

  return {
    type: 'solution' as const,
    solution,
  }
}

type TypedFlatPaymentSelection =
  | ActionExecutionResult
  | {
      type: 'selected'
      solution: PaymentSolution
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
}

export const resolveCostPaymentSelection = (
  player: PlayerState,
  cost: Partial<Resource> | ComplexCost,
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
  const solutions = computeAllBuyableCombinations(
    player,
    normalizedCost,
    undefined,
    options.costType,
  )
  return resolvePaymentSolutionSelection(
    solutions,
    normalizePaymentChoiceValue(paymentChoice, optionValuePrefix),
    optionValuePrefix,
    options.includeReturnedCard ?? false,
    failure,
  )
}

export const resolveTypedFlatPaymentSelection = (
  player: PlayerState,
  baseCost: Partial<Resource>,
  optionValuePrefix: string,
  paymentChoice: string | undefined,
  failure: ActionExecutionResult,
  costType?: CostModifierType,
): TypedFlatPaymentSelection => {
  return resolveCostPaymentSelection(
    player,
    baseCost,
    optionValuePrefix,
    paymentChoice,
    failure,
    {
      costType,
    },
  )
}

export const executeResolvedTypedFlatPayment = (
  player: PlayerState,
  payment: Extract<TypedFlatPaymentSelection, { type: 'selected' }>,
) => {
  executePaymentSolution(player, payment.solution)
}

export const canAffordTypedFlatCost = (
  player: PlayerState,
  baseCost: Partial<Resource>,
  costType?: CostModifierType,
) => {
  const resolved = resolveTypedFlatPaymentSolution(player, baseCost, costType)
  return resolved !== null
}

export const payTypedFlatCost = (
  player: PlayerState,
  baseCost: Partial<Resource>,
  costType?: CostModifierType,
) => {
  const resolved = resolveTypedFlatPaymentSolution(player, baseCost, costType)
  if (!resolved) return false
  if (resolved.type === 'direct') {
    payResources(player, resolved.directCost)
    return true
  }
  executePaymentSolution(player, resolved.solution)
  return true
}

export const resolveActionPreviewCost = (
  context: ActionAvailabilityContext,
  getBaseCost: (context: ActionAvailabilityContext) => Partial<Resource>,
  costOverride?: Partial<Resource>,
) => applyCostOverride(getBaseCost(context), costOverride)

export const canAffordActionPreviewCost = (
  context: ActionAvailabilityContext,
  getBaseCost: (context: ActionAvailabilityContext) => Partial<Resource>,
  costOverride?: Partial<Resource>,
) =>
  canAffordCost(
    context.player,
    resolveActionPreviewCost(context, getBaseCost, costOverride),
  )

export const resolveCardPreviewCost = (
  state: GameState,
  player: PlayerState,
  actionId: string,
  cardId: string,
  baseCost: Partial<Resource> | ComplexCost | null | undefined,
  actionCardId?: string,
): Partial<Resource> | ComplexCost | null => {
  if (!baseCost) return null
  if (isComplexCost(baseCost)) return baseCost
  return resolveCardCostWithModifiers(
    state,
    player,
    actionId,
    cardId,
    baseCost,
    actionCardId,
  )
}

export const resolveCardPreviewCostByProvider = (
  state: GameState,
  player: PlayerState,
  actionId: string,
  cardId: string,
  getBaseCost: () => Partial<Resource> | ComplexCost | null | undefined,
  actionCardId?: string,
) =>
  resolveCardPreviewCost(
    state,
    player,
    actionId,
    cardId,
    getBaseCost(),
    actionCardId,
  )

export const canAffordCardPreviewCost = (
  state: GameState,
  player: PlayerState,
  actionId: string,
  cardId: string,
  baseCost: Partial<Resource> | ComplexCost | null | undefined,
  actionCardId?: string,
  costType?: CostModifierType,
) =>
  (() => {
    const previewCost = resolveCardPreviewCost(
      state,
      player,
      actionId,
      cardId,
      baseCost,
      actionCardId,
    )
    if (!previewCost) return false
    if (!isComplexCost(previewCost)) {
      return canAffordTypedFlatCost(player, previewCost, costType)
    }
    return canPayCost(player, previewCost, costType)
  })()

export const canAffordCardPreviewCostByProvider = (
  state: GameState,
  player: PlayerState,
  actionId: string,
  cardId: string,
  getBaseCost: () => Partial<Resource> | ComplexCost | null | undefined,
  actionCardId?: string,
  costType?: CostModifierType,
) =>
  canAffordCardPreviewCost(
    state,
    player,
    actionId,
    cardId,
    getBaseCost(),
    actionCardId,
    costType,
  )

export const payCardPreviewCost = (
  state: GameState,
  player: PlayerState,
  actionId: string,
  cardId: string,
  baseCost: Partial<Resource> | ComplexCost | null | undefined,
  actionCardId?: string,
  costType?: CostModifierType,
) => {
  const previewCost = resolveCardPreviewCost(
    state,
    player,
    actionId,
    cardId,
    baseCost,
    actionCardId,
  )
  if (previewCost === null) return false
  if (!isComplexCost(previewCost)) {
    return payTypedFlatCost(player, previewCost, costType)
  }
  const solution = computeAllBuyableCombinations(
    player,
    previewCost,
    undefined,
    costType,
  )[0]
  if (!solution) return false
  executePaymentSolution(player, solution)
  return true
}

export const payCardPreviewCostByProvider = (
  state: GameState,
  player: PlayerState,
  actionId: string,
  cardId: string,
  getBaseCost: () => Partial<Resource> | ComplexCost | null | undefined,
  actionCardId?: string,
  costType?: CostModifierType,
) =>
  payCardPreviewCost(
    state,
    player,
    actionId,
    cardId,
    getBaseCost(),
    actionCardId,
    costType,
  )

const describePaymentSolution = (
  solution: PaymentSolution,
  includeReturnedCard: boolean,
): Record<string, any> => {
  return {
    resourcesPaid: solution.resourcesPaid,
    cardUsed: includeReturnedCard && solution.cardUsed ? solution.cardUsed : undefined
  }
}


export const buildPaymentChoiceResult = (
  solutions: PaymentSolution[],
  optionValuePrefix: string,
  includeReturnedCard = false,
): ActionExecutionResult => {
  const orderedSolutions = sortPaymentSolutions(solutions)
  return {
    type: 'choice',
  promptKey: 'prompt.selectPayment',
  options: orderedSolutions.map((solution, idx) => ({
    value: `${optionValuePrefix}:${idx}`,
    labelKey: 'prompt.selectPaymentOption',
    labelParams: describePaymentSolution(solution, includeReturnedCard) as unknown as Record<string, string | number>,
  })),
  }
}

export const resolvePaymentSolutionSelection = (
  solutions: PaymentSolution[],
  paymentChoice: string | undefined,
  optionValuePrefix: string,
  includeReturnedCard: boolean,
  failure: ActionExecutionResult,
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
  )
}
