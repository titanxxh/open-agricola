import type { ActionExecutionResult, GameState, PlayerState, ComplexCost, Resource } from '../../game/types'
import { getMinorImprovement } from '../../game/minor-improvements'
import { gainResources } from './gain'
import { canPayResources, payResources, computeAllBuyableCombinations, executePaymentSolution, returnCardToBoard } from './pay'
import { getMajorCardEffect } from '../cards/major'
import { activateCard } from './activate-card'

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
      const activation = activateCard(state, player, improvement.id, 'onBuy')
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
      const activation = activateCard(state, player, improvement.id, 'onBuy')
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
  const activation = activateCard(state, player, improvement.id, 'onBuy')
  state.availableMajorImprovements = state.availableMajorImprovements.filter(
    (id) => id !== improvement.id,
  )
  return activation.type === 'flow' ? activation : { type: 'ok' }
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

const playMinorImprovement = (
  player: PlayerState,
  improvementId: string,
): ActionExecutionResult => {
  const improvement = getMinorImprovement(improvementId)
  if (!improvement) {
    return { type: 'fail', logKey: 'log.minorImprovementFail' }
  }
  if (!player.minorHand.includes(improvement.id)) {
    return { type: 'fail', logKey: 'log.minorImprovementFail' }
  }
  const cost = getMinorImprovementCost(player, improvementId) ?? improvement.cost ?? {}
  if (!canPayResources(player, cost)) {
    return { type: 'fail', logKey: 'log.minorImprovementFail' }
  }
  payResources(player, cost)
  if (improvement.reward) {
    gainResources(player, improvement.reward)
  }
  player.minorHand = player.minorHand.filter((id) => id !== improvement.id)
  player.minorPlayed.push(improvement.id)
  player.playedCards = player.playedCards ?? []
  player.playedCards.push(`minor:${improvement.id}`)
  return { type: 'ok' }
}

export const playImprovement = (
  state: GameState,
  player: PlayerState,
  improvementId: string,
  mode: ImprovementPlayMode = 'major',
  paymentChoice?: string,
): ActionExecutionResult => {
  if (paymentChoice?.startsWith('pay:')) {
    const parts = paymentChoice.split(':')
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
    return playMinorImprovement(player, parsed.id)
  }

  const majorImprovement = allowMajor
    ? getMajorCardEffect(parsed.id)
    : undefined
  if (majorImprovement) {
    return playMajorImprovement(state, player, parsed.id)
  }
  if (allowMinor) {
    return playMinorImprovement(player, parsed.id)
  }
  return { type: 'fail', logKey: 'log.improvementFail' }
}
