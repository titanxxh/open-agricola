import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getMinorImprovementCard } from '../catalog'
import { getMajorCardEffect } from '../major'

const CARD_ID = 'D80_BrickHammer'

const getImprovementClayCost = (builtId: string): number => {
  const minor = getMinorImprovementCard(builtId)
  if (minor) {
    return (minor.cost?.clay ?? 0) + (minor.altCosts?.reduce((m, c) => Math.max(m, c.clay ?? 0), 0) ?? 0)
  }
  const major = getMajorCardEffect(builtId)
  if (major) {
    const costs = Array.isArray(major.cost) ? major.cost : [major.cost ?? {}]
    return costs.reduce((m, c) => Math.max(m, (c as Record<string, number>).clay ?? 0), 0)
  }
  return 0
}

// D80 Brick Hammer: Each time after you build an improvement costing at least 2 CLAY,
// you get 1 STONE.
const listener: CardListenerRegistration = {
  id: 'D80-brick-hammer-after-improvement',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['improvement-any'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const choice = context.choice ?? ''
    const builtId = choice.replace(/^major:/, '').replace(/^minor:/, '')
    if (!builtId) return
    if (getImprovementClayCost(builtId) < 2) return
    return { flow: gainLeaf(CARD_ID, { stone: 1 }), sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

export const D80_BrickHammer = new MinorImprovement({
  id: CARD_ID,
  name: 'Brick Hammer',
  deck: 'D',
  number: 80,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Each time after you build an improvement costing at least 2 <CLAY>, you get 1 <STONE>.'],
  cost: { wood: 1 },
  altCosts: [{ food: 1 }],
  newSet: true,
})
