import type { ActionChoiceOption, ActionDefinition, ActionExecutionResult, GameState, PlayerState, ComplexCost, Resource, Bonus } from '../../game/types'
import type { PaymentInfo } from '../../cards/card-effects'
import { getMinorImprovement } from '../../game/minor-improvements'
import { gainResources } from './gain'
import { canPayResources, payResources, computeAllBuyableCombinations, executePaymentSolution, returnCardToBoard, applyCostOverride } from './pay'
import { getMajorCardEffect, majorCardEffects } from '../../cards/major'
import { getCardModifier } from '../../cards/card-modifiers'
import { getMatchingListeners, executeCardListener, type CardListenerContext } from '../../cards/card-listeners'
import { activateCard } from './activate-card'

const applyCardCostModifiers = (
  state: GameState,
  player: PlayerState,
  cardId: string,
  baseCost: Partial<Resource>,
  actionCardId?: string,
): Partial<Resource> | ComplexCost => {
  const emptySpace = { id: '', nameKey: '', descriptionKey: '', roundAvailable: 1, gainPerRound: {}, canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' as const }), resources: {} as any, takenBy: null }
  const context: CardListenerContext = {
    state,
    player,
    space: emptySpace as any,
    actionId: 'improvement-any',
    phase: 'computeCardCosts',
  }
  const matched = getMatchingListeners(context)
  let cost = { ...baseCost }
  const collectedBonuses: Bonus[] = []
  for (const entry of matched) {
    const result = executeCardListener(entry.registration, {
      ...context,
      cardId,
      actionCardId,
    } as any)
    if (result?.costs) {
      cost = applyCostOverride(cost, result.costs)
    }
    if (result?.bonuses) {
      collectedBonuses.push(...result.bonuses)
    }
  }
  if (collectedBonuses.length > 0) {
    return { fee: cost, bonuses: collectedBonuses }
  }
  return cost
}

export type ImprovementPlayMode = 'major' | 'minor' | 'any'

const parseImprovementChoice = (choice: string) => {
  if (choice.startsWith('major:')) {
    return { kind: 'major' as const, id: choice.replace('major:', '') }
  }
  if (choice.startsWith('minor:')) {
    return { kind: 'minor' as const, id: choice.replace('minor:', '') }
  }
  return { kind: null, id: choice }
}

const isComplexCost = (cost: Partial<Resource> | ComplexCost | undefined): cost is ComplexCost => {
  if (!cost) return false
  return 'fee' in cost || 'fees' in cost || 'trades' in cost || 'cards' in cost || 'bonuses' in cost
}

const playMajorImprovement = (
  state: GameState,
  player: PlayerState,
  improvementId: string,
  paymentChoice?: string,
): ActionExecutionResult => {
  const improvement = getMajorCardEffect(improvementId)
  if (!improvement) {
    return { type: 'fail', logKey: 'log.improvementFail' }
  }
  if (!state.availableMajorImprovements.includes(improvement.id)) {
    return { type: 'fail', logKey: 'log.improvementFail' }
  }

  const cost = improvement.cost ?? {}
  
  if (isComplexCost(cost)) {
    const solutions = computeAllBuyableCombinations(player, cost, player.improvements)
    
    if (solutions.length === 0) {
      return { type: 'fail', logKey: 'log.improvementFail' }
    }
    
    if (solutions.length === 1) {
      const solution = solutions[0]
      const cardUsed = executePaymentSolution(player, solution)
      if (cardUsed) {
        returnCardToBoard(player, cardUsed)
        state.availableMajorImprovements.push(cardUsed)
      }
      player.improvements.push(improvement.id)
      player.playedCards = player.playedCards ?? []
      player.playedCards.push(`major:${improvement.id}`)
      state.availableMajorImprovements = state.availableMajorImprovements.filter(
        (id) => id !== improvement.id,
      )
      const paymentInfo: PaymentInfo = { resourcesPaid: solution.resourcesPaid, feeIndex: solution.feeIndex }
      const activation = activateCard(state, player, improvement.id, 'onBuy', paymentInfo)
      return activation.type === 'flow' ? activation : { type: 'ok' }
    }

    if (paymentChoice) {
      const choiceIndex = parseInt(paymentChoice, 10)
      const solution = solutions[choiceIndex]
      if (!solution) {
        return { type: 'fail', logKey: 'log.improvementFail' }
      }
      const cardUsed = executePaymentSolution(player, solution)
      if (cardUsed) {
        returnCardToBoard(player, cardUsed)
        state.availableMajorImprovements.push(cardUsed)
      }
      player.improvements.push(improvement.id)
      player.playedCards = player.playedCards ?? []
      player.playedCards.push(`major:${improvement.id}`)
      state.availableMajorImprovements = state.availableMajorImprovements.filter(
        (id) => id !== improvement.id,
      )
      const paymentInfo: PaymentInfo = { resourcesPaid: solution.resourcesPaid, feeIndex: solution.feeIndex }
      const activation = activateCard(state, player, improvement.id, 'onBuy', paymentInfo)
      return activation.type === 'flow' ? activation : { type: 'ok' }
    }
    
    return {
      type: 'choice',
      promptKey: 'prompt.selectPayment',
      options: solutions.map((sol, idx) => {
        const resourcesDesc = Object.entries(sol.resourcesPaid)
          .filter(([, v]) => (v ?? 0) > 0)
          .map(([k, v]) => `${k}:${v}`)
          .join(', ')
        const cardDesc = sol.cardUsed ? ` (return ${sol.cardUsed})` : ''
        return {
          value: `pay:${improvementId}:${idx}`,
          labelKey: resourcesDesc + cardDesc,
        }
      }),
    }
  }

  if (!canPayResources(player, cost)) {
    return { type: 'fail', logKey: 'log.improvementFail' }
  }
  payResources(player, cost)
  player.improvements.push(improvement.id)
  player.playedCards = player.playedCards ?? []
  player.playedCards.push(`major:${improvement.id}`)
  const paymentInfo: PaymentInfo = { resourcesPaid: cost }
  const activation = activateCard(state, player, improvement.id, 'onBuy', paymentInfo)
  state.availableMajorImprovements = state.availableMajorImprovements.filter(
    (id) => id !== improvement.id,
  )

  // Return with logKey to record the improvement play with payment info
  const result: ActionExecutionResult = activation.type === 'flow' ? activation : { type: 'ok' }
  if (result.type === 'ok') {
    result.logKey = 'log.playImprovement'
    result.logParams = { improvements: improvement.id, costResources: cost }
  }
  return result
}

export const getMinorImprovementCost = (
  player: PlayerState,
  improvementId: string,
) => {
  const improvement = getMinorImprovement(improvementId)
  if (!improvement) return null
  const cost = { ...improvement.cost }
  if (player.minorPlayed.includes('B75_WoodWorkshop') && (cost.wood ?? 0) > 0) {
    cost.wood = Math.max(0, (cost.wood ?? 0) - 1)
  }
  return cost
}

const placeMinorImprovement = (
  state: GameState,
  player: PlayerState,
  improvement: NonNullable<ReturnType<typeof getMinorImprovement>>,
  paymentInfo: PaymentInfo,
  cost: Partial<Resource>,
): ActionExecutionResult => {
  if (improvement.reward) {
    gainResources(player, improvement.reward)
  }
  player.minorHand = player.minorHand.filter((id) => id !== improvement.id)
  player.minorPlayed.push(improvement.id)
  player.playedCards = player.playedCards ?? []
  player.playedCards.push(`minor:${improvement.id}`)
  const modifier = getCardModifier(improvement.id)
  if (modifier && !player.activeModifiers.some(m => m.cardId === modifier.cardId)) {
    player.activeModifiers.push(modifier)
  }
  const activation = activateCard(state, player, improvement.id, 'onBuy', paymentInfo)
  if (activation.type === 'flow') {
    return activation
  }
  return {
    type: 'ok',
    logKey: 'log.playMinorImprovement',
    logParams: { improvements: improvement.id, costResources: cost },
  }
}

const playMinorImprovement = (
  state: GameState,
  player: PlayerState,
  improvementId: string,
  actionCardId?: string,
  paymentChoice?: string,
): ActionExecutionResult => {
  const improvement = getMinorImprovement(improvementId)
  if (!improvement) {
    return { type: 'fail', logKey: 'log.minorImprovementFail' }
  }
  if (!player.minorHand.includes(improvement.id)) {
    return { type: 'fail', logKey: 'log.minorImprovementFail' }
  }

  // altCosts path: use ComplexCost / PaymentSolution pipeline
  if (improvement.altCosts && improvement.altCosts.length > 0) {
    const complexCost: ComplexCost = { fees: improvement.altCosts }
    const solutions = computeAllBuyableCombinations(player, complexCost)

    if (solutions.length === 0) {
      return { type: 'fail', logKey: 'log.minorImprovementFail' }
    }

    if (solutions.length === 1) {
      const solution = solutions[0]
      executePaymentSolution(player, solution)
      const paymentInfo: PaymentInfo = { resourcesPaid: solution.resourcesPaid, feeIndex: solution.feeIndex }
      return placeMinorImprovement(state, player, improvement, paymentInfo, solution.resourcesPaid)
    }

    if (paymentChoice !== undefined) {
      const choiceIndex = parseInt(paymentChoice, 10)
      const solution = solutions[choiceIndex]
      if (!solution) {
        return { type: 'fail', logKey: 'log.minorImprovementFail' }
      }
      executePaymentSolution(player, solution)
      const paymentInfo: PaymentInfo = { resourcesPaid: solution.resourcesPaid, feeIndex: solution.feeIndex }
      return placeMinorImprovement(state, player, improvement, paymentInfo, solution.resourcesPaid)
    }

    // Multiple solutions — return choice to player
    return {
      type: 'choice',
      promptKey: 'prompt.selectPayment',
      options: solutions.map((sol, idx) => {
        const resourcesDesc = Object.entries(sol.resourcesPaid)
          .filter(([, v]) => (v ?? 0) > 0)
          .map(([k, v]) => `${k}:${v}`)
          .join(', ')
        return {
          value: `pay:minor:${improvementId}:${idx}`,
          labelKey: resourcesDesc,
        }
      }),
    }
  }

  // Flat-cost path (existing behavior)
  const baseCost = getMinorImprovementCost(player, improvementId) ?? improvement.cost ?? {}
  const modifiedCost = applyCardCostModifiers(state, player, improvementId, baseCost, actionCardId)

  // If hooks returned bonuses, route through ComplexCost pipeline
  if (isComplexCost(modifiedCost)) {
    const solutions = computeAllBuyableCombinations(player, modifiedCost)
    if (solutions.length === 0) {
      return { type: 'fail', logKey: 'log.minorImprovementFail' }
    }
    if (solutions.length === 1 || paymentChoice) {
      const choiceIndex = paymentChoice ? parseInt(paymentChoice, 10) : 0
      const solution = solutions[choiceIndex]
      if (!solution) {
        return { type: 'fail', logKey: 'log.minorImprovementFail' }
      }
      executePaymentSolution(player, solution)
      const pInfo: PaymentInfo = { resourcesPaid: solution.resourcesPaid, feeIndex: solution.feeIndex }
      return placeMinorImprovement(state, player, improvement, pInfo, solution.resourcesPaid)
    }
    return {
      type: 'choice',
      promptKey: 'prompt.selectPayment',
      options: solutions.map((sol, idx) => {
        const resourcesDesc = Object.entries(sol.resourcesPaid)
          .filter(([, v]) => (v ?? 0) > 0)
          .map(([k, v]) => `${k}:${v}`)
          .join(', ')
        return {
          value: `pay:minor:${improvementId}:${idx}`,
          labelKey: resourcesDesc,
        }
      }),
    }
  }

  const cost = modifiedCost
  if (!canPayResources(player, cost)) {
    return { type: 'fail', logKey: 'log.minorImprovementFail' }
  }
  payResources(player, cost)
  const paymentInfo: PaymentInfo = { resourcesPaid: cost }
  return placeMinorImprovement(state, player, improvement, paymentInfo, cost)
}

export const playImprovement = (
  state: GameState,
  player: PlayerState,
  improvementId: string,
  mode: ImprovementPlayMode = 'major',
  paymentChoice?: string,
): ActionExecutionResult => {
  // Payment choice can arrive as either paymentChoice param (direct call)
  // or as improvementId (via resolveChoice which passes choice as first arg)
  const payValue = paymentChoice?.startsWith('pay:') ? paymentChoice
    : improvementId.startsWith('pay:') ? improvementId
    : undefined
  if (payValue) {
    const parts = payValue.split(':')
    // pay:minor:cardId:idx or pay:cardId:idx (major)
    if (parts[1] === 'minor') {
      const minorId = parts[2]
      const choiceIdx = parts[3]
      if (minorId && choiceIdx !== undefined) {
        return playMinorImprovement(state, player, minorId, undefined, choiceIdx)
      }
    }
    const targetId = parts[1]
    const choiceIdx = parts[2]
    if (targetId && choiceIdx !== undefined) {
      const parsed = parseImprovementChoice(targetId)
      if (parsed.kind === 'major' || getMajorCardEffect(parsed.id)) {
        return playMajorImprovement(state, player, parsed.kind === 'major' ? parsed.id : parsed.id, choiceIdx)
      }
    }
  }

  const parsed = parseImprovementChoice(improvementId)
  const allowMajor = mode === 'major' || mode === 'any'
  const allowMinor = mode === 'minor' || mode === 'any'

  if (parsed.kind === 'major') {
    if (!allowMajor) {
      return { type: 'fail', logKey: 'log.improvementFail' }
    }
    return playMajorImprovement(state, player, parsed.id)
  }
  if (parsed.kind === 'minor') {
    if (!allowMinor) {
      return { type: 'fail', logKey: 'log.minorImprovementFail' }
    }
    return playMinorImprovement(state, player, parsed.id)
  }

  const majorImprovement = allowMajor
    ? getMajorCardEffect(parsed.id)
    : undefined
  if (majorImprovement) {
    return playMajorImprovement(state, player, parsed.id)
  }
  if (allowMinor) {
    return playMinorImprovement(state, player, parsed.id)
  }
  return { type: 'fail', logKey: 'log.improvementFail' }
}

const canAffordMinorImprovement = (player: PlayerState, improvement: NonNullable<ReturnType<typeof getMinorImprovement>>): boolean => {
  if (improvement.altCosts && improvement.altCosts.length > 0) {
    const complexCost: ComplexCost = { fees: improvement.altCosts }
    return computeAllBuyableCombinations(player, complexCost).length > 0
  }
  const cost = getMinorImprovementCost(player, improvement.id) ?? improvement.cost ?? {}
  return canPayResources(player, cost)
}

const buildPlayableMinorOptions = (player: PlayerState): ActionChoiceOption[] =>
  player.minorHand
    .map((id) => getMinorImprovement(id))
    .filter(
      (improvement): improvement is NonNullable<typeof improvement> =>
        !!improvement,
    )
    .filter((improvement) => canAffordMinorImprovement(player, improvement))
    .map((improvement) => ({
      value: improvement.id,
      labelKey: `minorImprovements.${improvement.id}.name`,
    }))

const buildMajorImprovementOptions = (
  available: string[],
  player: PlayerState,
): ActionChoiceOption[] =>
  majorCardEffects
    .filter((improvement) => available.includes(improvement.id))
    .filter((improvement) => {
      const cost = improvement.cost
      if (!cost) return true
      if (isComplexCost(cost)) {
        return computeAllBuyableCombinations(player, cost, player.improvements).length > 0
      }
      return canPayResources(player, cost as Partial<PlayerState['resources']>)
    })
    .map((improvement) => ({
      value: `major:${improvement.id}`,
      labelKey: `improvements.${improvement.id}.name`,
    }))

const buildMinorImprovementOptions = (player: PlayerState): ActionChoiceOption[] =>
  player.minorHand
    .map((id) => getMinorImprovement(id))
    .filter(
      (improvement): improvement is NonNullable<typeof improvement> =>
        !!improvement,
    )
    .filter((improvement) => canAffordMinorImprovement(player, improvement))
    .map((improvement) => ({
      value: `minor:${improvement.id}`,
      labelKey: `minorImprovements.${improvement.id}.name`,
    }))

export const minorImprovementAction: ActionDefinition = {
  id: 'minor-improvement',
  nameKey: 'actions.minor-improvement.name',
  descriptionKey: 'actions.minor-improvement.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_, player) =>
    buildPlayableMinorOptions(player).length > 0,
  execute: ({ player }) => {
    const options = buildPlayableMinorOptions(player)
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
    buildMajorImprovementOptions(state.availableMajorImprovements, player).length >
      0 || buildMinorImprovementOptions(player).length > 0,
  execute: ({ state, player }) => {
    const options = [
      ...buildMajorImprovementOptions(state.availableMajorImprovements, player),
      ...buildMinorImprovementOptions(player),
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
  resolveChoice: ({ state, player }, choice) =>
    playImprovement(state, player, choice, 'any'),
}
