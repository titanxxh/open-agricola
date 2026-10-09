import { cardIdentityChoice } from '../helpers/card-choice'
import type { ActionChoiceOption, ActionDefinition, ActionExecutionResult, ActionSpace, ComplexCost, GameState, InternalActionChild, InternalActionChildren, PaymentSolution, PlayerState, ProtectedObservation, Resource } from '../../contract/types'
import type { EventSink } from '../../contract/events'
import { meetsCardPrerequisites } from '../../cards/helpers/prerequisites'
import { getOccupation } from '../../cards/registry-display'
import { runCardListeners } from '../../cards/card-listeners'
import { PaymentSolver } from '../payment'
import { ensureCardModifiers } from '../../cards/card-modifiers'
import { activateCardEffect } from './internal/activate-card-effect'
import { addCardResourceGained } from '../../cards/helpers/card-state'
import { incOccupationBuilt, recordDraftPlayed } from '../../session/stats'
import { buildInternalPayChild, paymentInfoFromPayResult } from '../helpers/pay-child'
import {
  cardEffectHandChangedEvent,
  readPrivateHandChangeSourceCard,
} from '../../session/private-hand-events'

const privateHandChangeContext = (
  sourceCard: string | undefined,
  occupationId: string,
  trueAction?: boolean,
): Record<string, unknown> =>
  ({
    ...(trueAction === false ? { trueAction: false } : {}),
    ...(sourceCard && sourceCard !== occupationId
      ? { privateHandChangeSourceCard: sourceCard }
      : {}),
  })

const readTrueAction = (
  params?: unknown,
  actionContext?: Record<string, unknown>,
) =>
  ((params as { trueAction?: boolean } | undefined)?.trueAction === false ||
    actionContext?.trueAction === false)
    ? false
    : undefined

const compactContext = (
  context: Record<string, unknown>,
): Record<string, unknown> | undefined =>
  Object.keys(context).length > 0 ? context : undefined

const buildOccupationCostProvider = (
  player: PlayerState,
  occupationId: string,
  costOverride?: Partial<PlayerState['resources']>,
) => () => costOverride ?? getOccupationCost(player, occupationId) ?? {}

const canAffordOccupationPreviewCost = (
  state: GameState,
  player: PlayerState,
  occupationId: string,
  costOverride?: Partial<PlayerState['resources']>,
  actionCardId?: string,
) =>
  PaymentSolver.canAffordCardPreviewCostByProvider(
    state,
    player,
    'occupation',
    occupationId,
    buildOccupationCostProvider(player, occupationId, costOverride),
    actionCardId,
    'occupation',
  )

export const isOccupationPlayable = (
  state: GameState,
  player: PlayerState,
  occupationId: string,
  costOverride?: Partial<PlayerState['resources']>,
  actionCardId?: string,
) => {
  const occupation = getOccupation(occupationId)
  if (!occupation || !player.occupationHand.includes(occupation.id)
    || !meetsCardPrerequisites(player, occupation, state.round, state)) return false
  return canAffordOccupationPreviewCost(
    state,
    player,
    occupationId,
    costOverride,
    actionCardId,
  )
}

export const playOccupation = (
  player: PlayerState,
  occupationId: string,
  costOverride?: Partial<PlayerState['resources']>,
  state?: GameState,
  actionCardId?: string,
): ActionExecutionResult => {
  const occupation = getOccupation(occupationId)
  if (!occupation) {
    return { type: 'fail', errorKey: 'log.occupationFail' }
  }
  if (!player.occupationHand.includes(occupation.id)
    || !meetsCardPrerequisites(player, occupation, state?.round, state)) {
    return { type: 'fail', errorKey: 'log.occupationFail' }
  }
  const cost = buildOccupationCostProvider(player, occupationId, costOverride)()
  const paySucceeded = state
    ? PaymentSolver.payCardPreviewCostByProvider(
        state,
        player,
        'occupation',
        occupationId,
        () => cost,
        actionCardId,
        'occupation',
      )
    : PaymentSolver.payTypedFlatCost(
        player,
        cost,
        'occupation',
        state,
      )
  if (!paySucceeded) {
    return { type: 'fail', errorKey: 'log.occupationFail' }
  }
  player.occupationHand = player.occupationHand.filter(
    (id) => id !== occupation.id,
  )
  player.occupationPlayed.push(occupation.id)
  incOccupationBuilt(player)
  if (state) {
    recordDraftPlayed(player, occupation.id, state.round)
  }
  ensureCardModifiers(player, occupation.id)
  // Trigger onBuy hook — if it returns a flow, propagate it to the engine
  if (state) {
    const activation = activateCardEffect(state, player, occupation.id, 'onBuy')
    if (activation.type === 'flow') {
      return activation
    }
  }
  return { type: 'ok' }
}

const applyOccupationPlay = (
  state: GameState,
  player: PlayerState,
  occupationId: string,
) => {
  player.occupationHand = player.occupationHand.filter(
    (id) => id !== occupationId,
  )
  if (!player.occupationPlayed.includes(occupationId)) {
    player.occupationPlayed.push(occupationId)
    incOccupationBuilt(player)
    recordDraftPlayed(player, occupationId, state.round)
  }
  ensureCardModifiers(player, occupationId)
}

const commitOccupationPlay = (
  state: GameState,
  player: PlayerState,
  occupationId: string,
  sourceCard?: string,
  actionContext?: Record<string, unknown>,
  emitPrivateEvent?: (event: ReturnType<typeof cardEffectHandChangedEvent>) => void,
  eventSink?: EventSink,
  reportProtectedObservation?: (observation: ProtectedObservation) => void,
): Extract<ActionExecutionResult, { type: 'ok' }> => {
  const wasInHand = player.occupationHand.includes(occupationId)
  if (wasInHand) {
    reportProtectedObservation?.({
      kind: 'hidden-information',
      recipientPlayerIds: state.players.map((entry) => entry.id),
      knownToPlayerIds: [player.id],
    })
  }
  applyOccupationPlay(state, player, occupationId)
  const handChangeSourceCard = readPrivateHandChangeSourceCard(actionContext, occupationId)
  if (wasInHand && handChangeSourceCard) {
    emitPrivateEvent?.(cardEffectHandChangedEvent(
      player.id,
      [occupationId],
      'occupation',
      handChangeSourceCard,
    ))
  }
  eventSink?.emit<'card.played'>({
    type: 'card.played',
    cardId: occupationId,
    cardType: 'occupation',
    sourceActionId: 'occupation',
    sourceCardId: occupationId,
  })
  if (sourceCard && sourceCard !== occupationId) {
    addCardResourceGained(player, sourceCard, { occupation: 1 })
  }
  return { type: 'ok' }
}

const getOccupationCost = (
  player: PlayerState,
  occupationId: string,
) => {
  const occupation = getOccupation(occupationId)
  if (!occupation) return null
  // Occupations only ever carry a Partial<Resource> cost (ComplexCost is majors-only).
  const cost: Partial<Resource> = { ...(occupation.cost as Partial<Resource> | undefined) }
  for (const mod of player.activeModifiers ?? []) {
    if (mod.type === 'bonus' && mod.appliesTo.includes('occupation') && mod.discount) {
      for (const [key, discount] of Object.entries(mod.discount)) {
        const rk = key as keyof typeof cost
        if ((cost[rk] ?? 0) > 0) {
          cost[rk] = Math.max(0, (cost[rk] ?? 0) - (discount ?? 0))
        }
      }
    }
  }
  return cost
}

const getLessonsCost = (player: PlayerState, spaceId: string) => {
  const isLessons4 = spaceId === 'lessons-4'
  const isLessons3 = spaceId === 'lessons-3'
  const isLessons56TwoFood = spaceId === 'lessons-56-2f'
  const isLessons56Variable = spaceId === 'lessons-56-variable'
  const base = isLessons3
    ? 2
    : isLessons56TwoFood
      ? 2
      : isLessons56Variable
        ? player.occupationPlayed.length <= 1
          ? 1
          : 2
    : isLessons4
      ? player.occupationPlayed.length <= 1
        ? 1
        : 2
      : player.occupationPlayed.length === 0
        ? 0
        : 1
  let food = base
  for (const mod of player.activeModifiers ?? []) {
    if (mod.type === 'bonus' && mod.appliesTo.includes('occupation') && mod.discount) {
      if (mod.discount.food && food > 0) {
        food = Math.max(0, food - mod.discount.food)
      }
    }
  }
  return food > 0 ? { food } : {}
}

export const getOccupationActionCost = getLessonsCost

const getOccupationActionBaseCost = (
  player: PlayerState,
  spaceId: string,
  params?: Record<string, unknown>,
) => {
  const exactCost = PaymentSolver.readExactCost(params)
  if (exactCost) return PaymentSolver.resolveExactUnitCost(exactCost, 1)
  return getLessonsCost(player, spaceId)
}

type OccupationChoicePolicy = {
  doable: boolean
  reserveResources?: Partial<Resource>
}

const mergeResourceReserve = (
  left: Partial<Resource> | undefined,
  right: Partial<Resource> | undefined,
): Partial<Resource> | undefined => {
  if (!right) return left
  const merged: Partial<Resource> = { ...(left ?? {}) }
  Object.entries(right).forEach(([rawKey, rawValue]) => {
    if (typeof rawValue !== 'number' || rawValue <= 0) return
    const key = rawKey as keyof Resource
    merged[key] = Math.max(merged[key] ?? 0, rawValue)
  })
  return merged
}

const buildPlayableOccupationOptions = (
  state: GameState,
  player: PlayerState,
  cost: Partial<PlayerState['resources']>,
  space: ActionSpace,
  actionCardId?: string,
): ActionChoiceOption[] =>
  player.occupationHand
    .map((id) => getOccupation(id))
    .filter(
      (occupation): occupation is NonNullable<typeof occupation> =>
        !!occupation,
    )
    .filter((occupation) =>
      isOccupationPlayable(
        state,
        player,
        occupation.id,
        cost,
        actionCardId,
      ),
    )
    .filter((occupation) => getOccupationChoicePolicy(
      state,
      player,
      space,
      occupation.id,
      cost,
      actionCardId,
    ).doable)
    .map((occupation) => ({
      ...cardIdentityChoice(occupation.id, 'occupation'),
    }))

const getOccupationChoicePolicy = (
  state: GameState,
  player: PlayerState,
  space: ActionSpace,
  occupationId: string,
  baseCost: Partial<PlayerState['resources']>,
  actionCardId?: string,
): OccupationChoicePolicy => {
  let doable = true
  let reserveResources: Partial<Resource> | undefined
  const results = runCardListeners({
    state,
    player,
    space,
    actionId: 'occupation',
    phase: 'isDoable',
    doable,
    choice: occupationId,
    sourceCard: actionCardId,
    actionCardId,
    extraData: { occupationBaseCost: baseCost },
  })
  for (const result of results) {
    if (result.doable === false) {
      doable = false
    }
    reserveResources = mergeResourceReserve(
      reserveResources,
      result.reserveResources,
    )
  }
  return { doable, reserveResources }
}

export const hasPlayableOccupationChoice = (
  state: GameState,
  player: PlayerState,
  spaceId: string,
  params?: Record<string, unknown>,
) => {
  const cost = getOccupationActionBaseCost(player, spaceId, params)
  if (!cost) return false
  const allowedCards = (params as { allowedCards?: string[] } | undefined)?.allowedCards
  return buildPlayableOccupationOptions(state, player, cost, { id: spaceId } as ActionSpace, spaceId)
    .some((option) => !allowedCards || allowedCards.includes(option.value))
}

export const canAffordOccupationActionCost = (
  state: GameState,
  player: PlayerState,
  occupationId: string,
  cost: Partial<PlayerState['resources']>,
  actionCardId?: string,
) =>
  collectOccupationActionPaymentOptions(
    state,
    player,
    occupationId,
    cost,
    actionCardId,
  ).length > 0

export const collectOccupationActionPaymentOptions = (
  state: GameState,
  player: PlayerState,
  occupationId: string,
  cost: Partial<PlayerState['resources']>,
  actionCardId?: string,
  reserveResources?: Partial<Resource>,
): PaymentSolution[] => {
  const previewCost = PaymentSolver.resolveCardPreviewCostByProvider(
    state,
    player,
    'occupation',
    occupationId,
    () => cost,
    actionCardId,
  )
  if (!previewCost) return []
  const playerIndex = state.players.indexOf(player)
  const paymentState =
    playerIndex >= 0 ? state : ({ ...state, players: [player] } as GameState)
  const paymentPlayerIndex = playerIndex >= 0 ? playerIndex : 0
  const normalizedCost: ComplexCost = PaymentSolver.isComplexCost(previewCost)
    ? previewCost
    : { fee: previewCost }
  return PaymentSolver.computeOptions(paymentState, paymentPlayerIndex, normalizedCost, {
    actionId: 'pay',
    costType: 'occupation',
    sourceCard: occupationId,
    spaceId: actionCardId,
    reserveResources,
  })
}

type OccupationCommitData = {
  occupationId: string
  sourceCard?: string
  actionContext?: Record<string, unknown>
}

const readOccupationCommitData = (
  result: Extract<ActionExecutionResult, { type: 'ok' }>,
): OccupationCommitData | null => {
  const raw = result.extraData?.occupationCommit
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Record<string, unknown>
  if (typeof data.occupationId !== 'string') return null
  return {
    occupationId: data.occupationId,
    sourceCard: typeof data.sourceCard === 'string' ? data.sourceCard : undefined,
    actionContext: data.actionContext && typeof data.actionContext === 'object'
      ? data.actionContext as Record<string, unknown>
      : undefined,
  }
}

const buildOccupationPayChild = (
  cost: ComplexCost,
  occupationId: string,
  actionContext: Record<string, unknown> | undefined,
  reserveResources: Partial<Resource> | undefined,
): InternalActionChild => buildInternalPayChild({
  cost,
  costType: 'occupation',
  optionPrefix: `pay:occupation:${occupationId}`,
  sourceCard: occupationId,
  reserveResources,
  actionContext: {
    costType: 'occupation',
    ...(actionContext ?? {}),
  },
})

const buildOccupationInternalChildren = (
  cost: ComplexCost,
  occupationId: string,
  actionContext: Record<string, unknown> | undefined,
  reserveResources: Partial<Resource> | undefined,
): InternalActionChildren => ({
  beforeHostListeners: [
    buildOccupationPayChild(cost, occupationId, actionContext, reserveResources),
  ],
  afterHostCommitListeners: [
    {
      actionId: 'activate-card-effect',
      sourceCard: occupationId,
      params: { cardId: occupationId, hook: 'onBuy' },
      actionContext,
      paymentInfoFrom: 'payment',
    },
  ],
})

export const playOccupationAction: ActionDefinition = {
  id: 'occupation',
  nameKey: 'actions.lessons.name',
  descriptionKey: 'actions.lessons.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (state, player, context) =>
    hasPlayableOccupationChoice(state, player, context?.space?.id ?? 'lessons', context?.params),
  execute: ({ state, player, space, params }) => {
    const typed = params as { allowedCards?: string[] } | undefined
    const cost = getOccupationActionBaseCost(player, space.id, params)
    if (!cost) return { type: 'fail', errorKey: 'log.occupationFail' }
    let playableOptions = buildPlayableOccupationOptions(
      state,
      player,
      cost,
      space,
      space.id,
    )
    if (typed?.allowedCards) {
      playableOptions = playableOptions.filter(opt => typed.allowedCards!.includes(opt.value))
    }
    if (playableOptions.length === 0) {
      return { type: 'fail', errorKey: 'log.occupationFail' }
    }
    return {
      type: 'request',
      request: { kind: 'choice', options: playableOptions },
      promptKey: 'ui.interactionChooseOccupation',
    }
  },
  resolveChoice: ({ player, space, params, state, sourceCard, actionContext }, choice) => {
    const typed = params as { allowedCards?: string[] } | undefined
    if (typed?.allowedCards && !typed.allowedCards.includes(choice)) {
      return { type: 'fail', errorKey: 'log.occupationFail' }
    }
    const occupation = getOccupation(choice)
    if (!occupation || !player.occupationHand.includes(occupation.id)
    || !meetsCardPrerequisites(player, occupation, state.round, state)) {
      return { type: 'fail', errorKey: 'log.occupationFail' }
    }
    const baseCost = getOccupationActionBaseCost(player, space.id, params)
    if (!baseCost) return { type: 'fail', errorKey: 'log.occupationFail' }
    const choicePolicy = getOccupationChoicePolicy(
      state,
      player,
      space,
      choice,
      baseCost,
      space.id,
    )
    if (!choicePolicy.doable) {
      return { type: 'fail', errorKey: 'log.occupationFail' }
    }
    // Apply computeCosts hook so card-driven trades (B109 PaperMaker
    // wood→food) and bonus modifiers participate in the pay leaf's
    // multi-solution enumeration. Without this the pay leaf only sees the
    // raw lessons cost and ignores B109's wood-for-food trade.
    const previewCost = PaymentSolver.resolveCardPreviewCostByProvider(
      state,
      player,
      'occupation',
      choice,
      () => baseCost,
      space.id,
    )
    // Always wrap as ComplexCost so the pay leaf routes through
    // resolveCostPaymentSelection. When `activeModifiers` contributes a
    // trade (A28 ForestSchool wood→food) the resulting multi-solution
    // payment surfaces a `prompt.selectPayment` choice instead of being
    // silently auto-resolved by the typed-flat fast path. Single-solution
    // cases (no trade / no bonus) auto-resolve inside the pay leaf without
    // any extra prompt.
    const resolvedCost: ComplexCost | Partial<PlayerState['resources']> =
      previewCost ?? baseCost
    const finalCost: ComplexCost = PaymentSolver.isComplexCost(resolvedCost)
      ? resolvedCost
      : { fee: resolvedCost as Partial<PlayerState['resources']> }
    const childContext = compactContext(privateHandChangeContext(
      sourceCard,
      choice,
      readTrueAction(params, actionContext),
    ))
    return {
      type: 'ok',
      extraData: {
        occupationCommit: {
          occupationId: choice,
          ...(sourceCard && sourceCard !== choice ? { sourceCard } : {}),
          ...(childContext ? { actionContext: childContext } : {}),
        },
      },
      internalChildren: buildOccupationInternalChildren(
        finalCost,
        choice,
        childContext,
        choicePolicy.reserveResources,
      ),
    }
  },
  completeInternalChildren: ({
    state,
    player,
    emitPrivateEvent,
    eventSink,
    reportProtectedObservation,
  }, result, internalResults) => {
    const data = readOccupationCommitData(result)
    if (!data) return result
    const paymentInfo = paymentInfoFromPayResult(internalResults.payment)
    if (!paymentInfo) return result
    return commitOccupationPlay(
      state,
      player,
      data.occupationId,
      data.sourceCard,
      data.actionContext,
      emitPrivateEvent,
      eventSink,
      reportProtectedObservation,
    )
  },
}
