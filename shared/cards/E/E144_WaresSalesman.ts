import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getMajorCardEffect } from '../major'
import { getRegisteredMinorImprovement } from '../types'

const CARD_ID = 'E144_WaresSalesman'

/**
 * E144 Wares Salesman:
 * Each time any player plays a cooking improvement (isCookery), the card owner
 * gets 1 of the primary building resource in the improvement's cost + 1 reed.
 *
 * Primary building resource is determined from the cost of the improvement:
 * clay (Fireplace, Cooking Hearth), stone (Clay Oven, Stone Oven), etc.
 *
 * Scope: 'any' — triggers for any player (including owner) playing a cookery improvement.
 */
const BUILDING_RESOURCES = ['clay', 'stone', 'wood', 'reed'] as const

const getPrimaryBuildingResource = (improvementId: string): string | null => {
  const major = getMajorCardEffect(improvementId)
  if (major) {
    const cost = major.cost as Record<string, number>
    for (const res of BUILDING_RESOURCES) {
      if ((cost[res] ?? 0) > 0) return res
    }
    return null
  }
  // Check minor improvements
  const minor = getRegisteredMinorImprovement(improvementId)
  if (minor?.isCookery && minor.cost) {
    for (const res of BUILDING_RESOURCES) {
      if ((minor.cost[res as keyof typeof minor.cost] ?? 0) > 0) return res
    }
  }
  return null
}

const isCookeryImprovement = (improvementId: string): boolean => {
  const major = getMajorCardEffect(improvementId)
  if (major?.isCookery) return true
  const minor = getRegisteredMinorImprovement(improvementId)
  if (minor?.isCookery) return true
  return false
}

const listener: CardListenerRegistration = {
  id: 'E144-wares-salesman-after-improvement',
  cardIds: [CARD_ID],
  actions: ['improvement-any', 'minor-improvement'],
  phases: ['after' as ActionHookPhase],
  scope: 'any',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const playedCardId = context.choice
    if (!playedCardId) return

    // Strip 'minor:' or 'major:' prefix if present
    const cleanId = playedCardId.replace(/^(minor|major):/, '')
    if (!isCookeryImprovement(cleanId)) return

    const buildingResource = getPrimaryBuildingResource(cleanId)
    if (!buildingResource) {
      // Fallback: give just 1 reed if no building resource identified
      return { flow: gainLeaf(CARD_ID, { reed: 1 }), sourceCard: CARD_ID }
    }

    return {
      flow: gainLeaf(CARD_ID, { [buildingResource]: 1, reed: 1 }),
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const E144_WaresSalesman = new Occupation({
  id: CARD_ID,
  name: 'Wares Salesman',
  deck: 'E',
  number: 144,
  category: 'GOODS_PROVIDER',
  desc: [
    'Each time any player (including you) plays or builds a card that lets them turn building resources into <FOOD>, you get exactly 1 corresponding building resource and 1 <REED>.',
  ],
  cost: {},
  players: '3+',
})
