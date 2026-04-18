import type { ActionDefinition, ActionExecutionResult, GameState, PlayerState, ComplexCost, Resource } from '../../game/types'
import type { PaymentInfo } from '../../cards/card-effects'
import { getMinorImprovement } from '../../game/minor-improvements'
import { getRegisteredMinorImprovement } from '../../cards/types'
import { payResources, computeAllBuyableCombinations, executePaymentSolution, returnCardToBoard, isComplexCost } from './pay'
import { getMajorCardEffect, majorCardEffects } from '../../cards/major'
import { getCardModifiers } from '../../cards/card-modifiers'
import { meetsCardPrerequisites } from '../../cards/helpers/prerequisites'
import { activateCard } from './activate-card'
import {
  canAffordCost,
  resolveCardPreviewCostByProvider,
  resolvePaymentSolutionSelection,
} from './pay-helpers'

/** Cards that satisfy a Fireplace return requirement. */
const FIREPLACE_MAJOR_IDS = ['Major_Fireplace1', 'Major_Fireplace2'] as const

/**
 * Returns the list of card IDs a player can use to satisfy a cost that requires
 * returning a Fireplace card. This includes both played major Fireplace cards
 * AND any minors with `fireplaceIdentity === true`.
 */
const getFireplaceReturnPool = (player: PlayerState): string[] => {
  const majorFireplaces = player.improvements.filter((id) =>
    FIREPLACE_MAJOR_IDS.includes(id as typeof FIREPLACE_MAJOR_IDS[number]),
  )
  const minorFireplaces = player.minorPlayed.filter((id) => {
    const card = getRegisteredMinorImprovement(id)
    return !!card?.fireplaceIdentity
  })
  return [...majorFireplaces, ...minorFireplaces]
}

/**
 * Returns the effective `playedCards` pool for cost resolution that may include
 * a Fireplace return. If the cost requires returning a Fireplace, include both
 * player.improvements AND any fireplaceIdentity minors.
 */
const getPlayedCardsForCost = (
  player: PlayerState,
  cost: Partial<PlayerState['resources']> | ComplexCost | null,
): string[] => {
  if (!cost || !isComplexCost(cost)) return player.improvements
  const list = cost.cards?.list
  if (!Array.isArray(list)) return player.improvements
  const needsFireplace = list.some((id) =>
    FIREPLACE_MAJOR_IDS.includes(id as typeof FIREPLACE_MAJOR_IDS[number]),
  )
  if (!needsFireplace) return player.improvements
  return getFireplaceReturnPool(player)
}

type ImprovementPlayMode = 'major' | 'minor' | 'any'
type ResolvedMinorImprovement = NonNullable<ReturnType<typeof getMinorImprovement>>

const parseImprovementChoice = (choice: string) => {
  if (choice.startsWith('major:')) {
    return { kind: 'major' as const, id: choice.replace('major:', '') }
  }
  if (choice.startsWith('minor:')) {
    return { kind: 'minor' as const, id: choice.replace('minor:', '') }
  }
  return { kind: null, id: choice }
}

const resolveImprovementActionCardId = (mode: ImprovementPlayMode) =>
  mode === 'minor' ? 'minor-improvement' : 'improvement-any'

const getMinorImprovementBaseCost = (
  improvementId: string,
) => {
  const improvement = getMinorImprovement(improvementId)
  if (!improvement) return null
  return { ...improvement.cost }
}

const getMinorImprovementEffectiveCost = (
  _player: PlayerState,
  improvement: ResolvedMinorImprovement,
) => {
  if (improvement.altCosts && improvement.altCosts.length > 0) {
    return { fees: improvement.altCosts } as ComplexCost
  }
  return getMinorImprovementBaseCost(improvement.id) ?? improvement.cost ?? {}
}

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
  costResources: NonNullable<PaymentInfo['resourcesPaid']>,
  options?: {
    returnedCards?: string[]
  },
) => {
  const params: Record<string, unknown> = {
    improvements: improvementId,
    costResources: getPositiveResourceLog(costResources) ?? {},
  }
  if (options?.returnedCards && options.returnedCards.length > 0) {
    params.returnedCards = options.returnedCards
  }
  return params
}

type SuccessfulImprovementResult = Extract<ActionExecutionResult, { type: 'ok' | 'flow' }>

const attachImprovementPayment = (
  result: SuccessfulImprovementResult,
  improvementId: string,
  resourcesPaid: NonNullable<PaymentInfo['resourcesPaid']>,
  returnedCardId?: string,
): SuccessfulImprovementResult => {
  result.extraData = {
    ...(result.extraData ?? {}),
    improvementPayment: {
      improvementId,
      resourcesPaid: getPositiveResourceLog(resourcesPaid) ?? {},
      ...(returnedCardId ? { returnedCardId } : {}),
    },
  }
  return result
}

const attachRequiredReturnCards = (
  cost: Partial<PlayerState['resources']> | ComplexCost | null,
  returnCards?: string[],
) => {
  if (!cost || !returnCards || returnCards.length === 0) {
    return cost
  }
  if (isComplexCost(cost)) {
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

const getMajorImprovementPreviewCost = (
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
    () => getMajorCardEffect(improvementId)?.cost ?? null,
    actionCardId,
  )
}

const getMinorImprovementPreviewCost = (
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

const canAffordMajorImprovement = (
  state: GameState,
  player: PlayerState,
  improvementId: string,
  actionCardId?: string,
) => {
  const previewCost = getMajorImprovementPreviewCost(state, player, improvementId, actionCardId)
  if (!previewCost) return false
  if (isComplexCost(previewCost)) {
    return (
      computeAllBuyableCombinations(
        player,
        previewCost,
        getPlayedCardsForCost(player, previewCost),
      ).length > 0
    )
  }
  return canAffordCost(player, previewCost)
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

const canAffordMinorImprovement = (
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
  if (isComplexCost(previewCost)) {
    return computeAllBuyableCombinations(
      player,
      previewCost,
      getPlayedCardsForCost(player, previewCost),
    ).length > 0
  }
  return canAffordCost(player, previewCost)
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
  return canAffordMinorImprovement(state, player, improvement, actionCardId)
}

const buildPlayableMinorOptions = (
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
    .filter((improvement) =>
      canAffordMinorImprovement(state, player, improvement, actionCardId),
    )
    .map((improvement) => ({
      value: improvement.id,
      labelKey: `minorImprovements.${improvement.id}.name`,
    }))

const buildMajorImprovementOptions = (
  available: string[],
  state: GameState,
  player: PlayerState,
  actionCardId = 'improvement-any',
  allowedPurchases?: string[],
) =>
  majorCardEffects
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

const buildMinorImprovementOptions = (
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
    .filter((improvement) =>
      canAffordMinorImprovement(state, player, improvement, actionCardId),
    )
    .map((improvement) => ({
      value: `minor:${improvement.id}`,
      labelKey: `minorImprovements.${improvement.id}.name`,
    }))

const finalizeMajorImprovementPurchase = (
  state: GameState,
  player: PlayerState,
  improvementId: string,
  paymentInfo: PaymentInfo,
  costResources: NonNullable<PaymentInfo['resourcesPaid']>,
  returnedMajorId?: string,
  suppressOnBuyEffects = false,
): ActionExecutionResult => {
  if (returnedMajorId) {
    returnCardToBoard(player, returnedMajorId)
    // Only return to the major pool if it is actually a major improvement card.
    // A fireplaceIdentity minor (e.g. D25) is removed from play entirely.
    if (getMajorCardEffect(returnedMajorId)) {
      state.availableMajorImprovements.push(returnedMajorId)
    }
  }

  player.improvements.push(improvementId)
  player.playedCards = player.playedCards ?? []
  player.playedCards.push(`major:${improvementId}`)
  state.availableMajorImprovements = state.availableMajorImprovements.filter(
    (id) => id !== improvementId,
  )

  if (suppressOnBuyEffects) {
    return attachImprovementPayment({
      type: 'ok',
      logKey: 'log.playImprovement',
      logParams: buildImprovementLogParams(improvementId, costResources, {
        returnedCards: returnedMajorId ? [returnedMajorId] : undefined,
      }),
    }, improvementId, costResources, returnedMajorId)
  }

  const activation = activateCard(state, player, improvementId, 'onBuy', paymentInfo)
  const result: SuccessfulImprovementResult =
    activation.type === 'flow' ? activation : { type: 'ok' }

  if (result.type === 'ok') {
    result.logKey = 'log.playImprovement'
    result.logParams = buildImprovementLogParams(improvementId, costResources, {
      returnedCards: returnedMajorId ? [returnedMajorId] : undefined,
    })
  }
  return attachImprovementPayment(result, improvementId, costResources, returnedMajorId)
}

const finalizeMinorImprovementPurchase = (
  state: GameState,
  player: PlayerState,
  improvement: ResolvedMinorImprovement,
  paymentInfo: PaymentInfo,
  costResources: NonNullable<PaymentInfo['resourcesPaid']>,
  returnedCardId?: string,
  suppressOnBuyEffects = false,
): ActionExecutionResult => {
  if (returnedCardId) {
    returnCardToBoard(player, returnedCardId)
    // Only return to the major pool if it is actually a major improvement card.
    // A fireplaceIdentity minor (e.g. D25) is removed from play entirely.
    if (getMajorCardEffect(returnedCardId)) {
      state.availableMajorImprovements.push(returnedCardId)
    }
  }

  player.minorHand = player.minorHand.filter((id) => id !== improvement.id)
  player.minorPlayed.push(improvement.id)
  player.playedCards = player.playedCards ?? []
  player.playedCards.push(`minor:${improvement.id}`)

  // D25 multi-identity: providesOccupation → also count as an occupation.
  if (improvement.providesOccupation) {
    player.extraOccupationsFromCards = player.extraOccupationsFromCards ?? []
    if (!player.extraOccupationsFromCards.includes(improvement.id)) {
      player.extraOccupationsFromCards.push(improvement.id)
    }
  }
  // fireplaceIdentity: no existing "major gained" emitter/listener exists in the codebase; skipping (YAGNI).
  // play-occupation listeners (e.g. E95_Miller) fire at action-hook level only; there is no
  // standalone emitter to call here. D25's own onBuy hook fires via activateCard below.

  getCardModifiers(improvement.id).forEach((modifier) => {
    if (!player.activeModifiers.some((m) => JSON.stringify(m) === JSON.stringify(modifier))) {
      player.activeModifiers.push(modifier)
    }
  })

  if (suppressOnBuyEffects) {
    return attachImprovementPayment({
      type: 'ok',
      logKey: 'log.playMinorImprovement',
      logParams: buildImprovementLogParams(improvement.id, costResources, {
        returnedCards: returnedCardId ? [returnedCardId] : undefined,
      }),
    }, improvement.id, costResources, returnedCardId)
  }

  const activation = activateCard(state, player, improvement.id, 'onBuy', paymentInfo)
  if (activation.type === 'flow') {
    return attachImprovementPayment(
      activation,
      improvement.id,
      costResources,
      returnedCardId,
    )
  }

  return attachImprovementPayment({
    type: 'ok',
    logKey: 'log.playMinorImprovement',
    logParams: buildImprovementLogParams(improvement.id, costResources, {
      returnedCards: returnedCardId ? [returnedCardId] : undefined,
    }),
  }, improvement.id, costResources, returnedCardId)
}

const resolveImprovementPayment = (
  player: PlayerState,
  cost: Partial<PlayerState['resources']> | ComplexCost,
  paymentChoice: string | undefined,
  optionValuePrefix: string,
  includeReturnedCard: boolean,
  failure: ActionExecutionResult,
  playedCards?: string[],
):
  | ActionExecutionResult
  | {
      type: 'selected'
      resourcesPaid: Partial<PlayerState['resources']>
      feeIndex?: number
      returnedCardId?: string
    } => {
  if (!isComplexCost(cost)) {
    if (!canAffordCost(player, cost)) {
      return failure
    }
    payResources(player, cost)
    return { type: 'selected', resourcesPaid: cost }
  }

  const solutions = computeAllBuyableCombinations(player, cost, playedCards)
  const resolved = resolvePaymentSolutionSelection(
    solutions,
    paymentChoice,
    optionValuePrefix,
    includeReturnedCard,
    failure,
  )
  if (resolved.type !== 'selected') {
    return resolved
  }

  const returnedCardId = executePaymentSolution(player, resolved.solution)
  return {
    type: 'selected',
    resourcesPaid: resolved.solution.resourcesPaid,
    feeIndex: resolved.solution.feeIndex,
    returnedCardId,
  }
}

const playMajorImprovement = (
  state: GameState,
  player: PlayerState,
  improvementId: string,
  actionCardId?: string,
  paymentChoice?: string,
  suppressOnBuyEffects = false,
): ActionExecutionResult => {
  const improvement = getMajorCardEffect(improvementId)
  if (!improvement) {
    return { type: 'fail', logKey: 'log.improvementFail' }
  }
  if (!state.availableMajorImprovements.includes(improvement.id)) {
    return { type: 'fail', logKey: 'log.improvementFail' }
  }

  const cost = getMajorImprovementPreviewCost(
    state,
    player,
    improvementId,
    actionCardId,
  ) ?? {}
  const resolvedPayment = resolveImprovementPayment(
    player,
    cost,
    paymentChoice,
    `pay:${improvementId}`,
    true,
    { type: 'fail', logKey: 'log.improvementFail' },
    getPlayedCardsForCost(player, cost),
  )
  if (resolvedPayment.type !== 'selected') {
    return resolvedPayment
  }
  const paymentInfo: PaymentInfo = {
    resourcesPaid: resolvedPayment.resourcesPaid,
    feeIndex: resolvedPayment.feeIndex,
    returnedCardId: resolvedPayment.returnedCardId,
  }
  return finalizeMajorImprovementPurchase(
    state,
    player,
    improvement.id,
    paymentInfo,
    resolvedPayment.resourcesPaid,
    resolvedPayment.returnedCardId,
    suppressOnBuyEffects,
  )
}

export const playMinorImprovement = (
  state: GameState,
  player: PlayerState,
  improvementId: string,
  actionCardId?: string,
  paymentChoice?: string,
  suppressOnBuyEffects = false,
  playContext: 'minorAction' | 'cardEffect' | 'setup' = 'minorAction',
): ActionExecutionResult => {
  const improvement = getMinorImprovement(improvementId)
  if (!improvement) {
    return { type: 'fail', logKey: 'log.minorImprovementFail' }
  }
  if (improvement.mustBePlayedViaMinorAction && playContext !== 'minorAction') {
    return { type: 'fail', logKey: 'log.minorImprovementRequiresMinorAction' }
  }
  if (!player.minorHand.includes(improvement.id)) {
    return { type: 'fail', logKey: 'log.minorImprovementFail' }
  }
  if (!meetsCardPrerequisites(player, improvement, state.round, state)) {
    return { type: 'fail', logKey: 'log.minorImprovementFail' }
  }
  const targetImprovement: ResolvedMinorImprovement = improvement
  const modifiedCost = getMinorImprovementPreviewCost(state, player, improvementId, actionCardId)
  if (!modifiedCost) {
    return { type: 'fail', logKey: 'log.minorImprovementFail' }
  }

  const resolvedPayment = resolveImprovementPayment(
    player,
    modifiedCost,
    paymentChoice,
    `pay:minor:${improvementId}`,
    !!(isComplexCost(modifiedCost) && modifiedCost.cards?.list?.length),
    { type: 'fail', logKey: 'log.minorImprovementFail' },
    getPlayedCardsForCost(player, modifiedCost),
  )
  if (resolvedPayment.type !== 'selected') {
    return resolvedPayment
  }
  const paymentInfo: PaymentInfo = {
    resourcesPaid: resolvedPayment.resourcesPaid,
    feeIndex: resolvedPayment.feeIndex,
    returnedCardId: resolvedPayment.returnedCardId,
  }
  return finalizeMinorImprovementPurchase(
    state,
    player,
    targetImprovement,
    paymentInfo,
    resolvedPayment.resourcesPaid,
    resolvedPayment.returnedCardId,
    suppressOnBuyEffects,
  )
}

export const playImprovement = (
  state: GameState,
  player: PlayerState,
  improvementId: string,
  mode: ImprovementPlayMode = 'major',
  paymentChoice?: string,
  sourceCard?: string,
  suppressOnBuyEffects = false,
): ActionExecutionResult => {
  // Payment choice can arrive as either paymentChoice param (direct call)
  // or as improvementId (via resolveChoice which passes choice as first arg)
  const payValue = paymentChoice?.startsWith('pay:') ? paymentChoice
    : improvementId.startsWith('pay:') ? improvementId
    : undefined
  if (payValue) {
    const parts = payValue.split(':')
    const actionCardId = sourceCard ?? resolveImprovementActionCardId(mode)
    // pay:minor:cardId:idx or pay:cardId:idx (major)
    if (parts[1] === 'minor') {
      const minorId = parts[2]
      const choiceIdx = parts[3]
      if (minorId && choiceIdx !== undefined) {
        return playMinorImprovement(
          state,
          player,
          minorId,
          actionCardId,
          choiceIdx,
          suppressOnBuyEffects,
        )
      }
    }
    const targetId = parts[1]
    const choiceIdx = parts[2]
    if (targetId && choiceIdx !== undefined) {
      const parsed = parseImprovementChoice(targetId)
      if (parsed.kind === 'major' || getMajorCardEffect(parsed.id)) {
        return playMajorImprovement(
          state,
          player,
          parsed.kind === 'major' ? parsed.id : parsed.id,
          actionCardId,
          choiceIdx,
          suppressOnBuyEffects,
        )
      }
    }
  }

  const parsed = parseImprovementChoice(improvementId)
  const allowMajor = mode === 'major' || mode === 'any'
  const allowMinor = mode === 'minor' || mode === 'any'
  const effectiveActionCardId = sourceCard ?? resolveImprovementActionCardId(mode)

  if (parsed.kind === 'major') {
    if (!allowMajor) {
      return { type: 'fail', logKey: 'log.improvementFail' }
    }
    return playMajorImprovement(
      state,
      player,
      parsed.id,
      effectiveActionCardId,
      undefined,
      suppressOnBuyEffects,
    )
  }
  if (parsed.kind === 'minor') {
    if (!allowMinor) {
      return { type: 'fail', logKey: 'log.minorImprovementFail' }
    }
    return playMinorImprovement(
      state,
      player,
      parsed.id,
      effectiveActionCardId,
      undefined,
      suppressOnBuyEffects,
    )
  }

  const majorImprovement = allowMajor
    ? getMajorCardEffect(parsed.id)
    : undefined
  if (majorImprovement) {
    return playMajorImprovement(
      state,
      player,
      parsed.id,
      effectiveActionCardId,
      undefined,
      suppressOnBuyEffects,
    )
  }
  if (allowMinor) {
    return playMinorImprovement(
      state,
      player,
      parsed.id,
      effectiveActionCardId,
      undefined,
      suppressOnBuyEffects,
    )
  }
  return { type: 'fail', logKey: 'log.improvementFail' }
}

export const minorImprovementAction: ActionDefinition = {
  id: 'minor-improvement',
  nameKey: 'actions.minor-improvement.name',
  descriptionKey: 'actions.minor-improvement.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (state, player) =>
    buildPlayableMinorOptions(state, player).length > 0,
  execute: ({ state, player }) => {
    const options = buildPlayableMinorOptions(state, player)
    if (options.length === 0) {
      return { type: 'ok' }
    }
    return {
      type: 'choice',
      promptKey: 'ui.interactionChooseMinorImprovement',
      options,
    }
  },
  resolveChoice: ({ state, player }, choice) =>
    playImprovement(state, player, choice, 'minor'),
}

export const improvementAnyAction: ActionDefinition = {
  id: 'improvement-any',
  nameKey: 'actions.major-improvement.name',
  descriptionKey: 'actions.major-improvement.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (state, player) =>
    buildMajorImprovementOptions(
      state.availableMajorImprovements,
      state,
      player,
    ).length > 0 ||
    buildMinorImprovementOptions(state, player).length > 0,
  execute: ({ state, player, sourceCard, params }) => {
    const actionCardId = sourceCard ?? resolveImprovementActionCardId('any')
    const allowedPurchases = Array.isArray((params as { allowedPurchases?: string[] } | undefined)?.allowedPurchases)
      ? (params as { allowedPurchases?: string[] }).allowedPurchases
      : undefined
    const options = [
      ...buildMajorImprovementOptions(
        state.availableMajorImprovements,
        state,
        player,
        actionCardId,
        allowedPurchases,
      ),
      ...buildMinorImprovementOptions(state, player, actionCardId, allowedPurchases),
    ]
    if (options.length === 0) {
      return { type: 'fail', logKey: 'log.improvementFail' }
    }
    return {
      type: 'choice',
      promptKey: 'ui.interactionChooseImprovement',
      options,
    }
  },
  resolveChoice: ({ state, player, sourceCard, params }, choice) =>
    playImprovement(
      state,
      player,
      choice,
      'any',
      undefined,
      sourceCard,
      (params as { suppressOnBuyEffects?: boolean } | undefined)?.suppressOnBuyEffects === true,
    ),
}
