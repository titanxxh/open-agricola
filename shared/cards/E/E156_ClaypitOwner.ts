import { Occupation, getRegisteredMinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getMajorCardEffect } from '../major'
import { isComplexCost } from '../../actions/effects/pay'

const CARD_ID = 'E156_ClaypitOwner'

/**
 * E156 Claypit Owner (Occupation, E, 156)
 * Each time another player plays an improvement with a printed clay cost,
 * card owner gets 1 food + 1 clay.
 *
 * BGA: onPlayerAfterBuildImprovement — checks if the built improvement
 * has clay in its printed cost.
 *
 * scope 'opponent' — fires when an opponent plays an improvement with clay cost.
 * Players 4+.
 */

const hasPrintedClayCost = (cardId: string): boolean => {
  // Check major improvements
  const major = getMajorCardEffect(cardId)
  if (major) {
    const cost = major.cost
    if (isComplexCost(cost)) {
      return (cost.fees ?? []).some((fee) => (fee.clay ?? 0) > 0)
        || (cost.fee ? (cost.fee.clay ?? 0) > 0 : false)
    }
    return (cost.clay ?? 0) > 0
  }

  // Check minor improvements
  const minor = getRegisteredMinorImprovement(cardId)
  if (minor?.cost) {
    return (minor.cost.clay ?? 0) > 0
  }

  return false
}

const getBuiltCardId = (choice: string | undefined): string | undefined => {
  if (!choice) return undefined
  return choice.replace(/^major:/, '').replace(/^minor:/, '')
}

const listener: CardListenerRegistration = {
  id: 'E156-claypit-owner-opponent-improvement-clay',
  cardIds: [CARD_ID],
  actions: ['improvement-any', 'minor-improvement'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const builtCardId = getBuiltCardId(context.choice)
    if (!builtCardId) return
    if (!hasPrintedClayCost(builtCardId)) return
    return { flow: gainLeaf(CARD_ID, { food: 1, clay: 1 }), sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

export const E156_ClaypitOwner = new Occupation({
  id: CARD_ID,
  name: 'Claypit Owner',
  deck: 'E',
  number: 156,
  category: 'GOODS_PROVIDER',
  desc: [
    'Each time another player plays or builds an improvement with a printed <CLAY> cost, you get 1 <FOOD> and 1 <CLAY>.',
  ],
  cost: {},
  players: '4+',
  newSet: true,
})
