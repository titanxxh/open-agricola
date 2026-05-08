import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getMinorImprovementCard } from '../catalog'
import { getMajorCard } from '../major'
import { isMajorCardId } from '../helpers/card-type'
import type { CardImpl } from '../registry'
import { D80_BrickHammer } from '../../cards-display/D/D80_BrickHammer'
export { D80_BrickHammer }

const CARD_ID = D80_BrickHammer.id

const getImprovementClayCost = (builtId: string): number => {
  const minor = getMinorImprovementCard(builtId)
  if (minor) {
    const cost = minor.cost as { clay?: number } | undefined
    return (cost?.clay ?? 0) + (minor.altCosts?.reduce((m, c) => Math.max(m, c.clay ?? 0), 0) ?? 0)
  }
  if (isMajorCardId(builtId)) {
    const major = getMajorCard(builtId)
    if (major) {
      const costs = Array.isArray(major.cost) ? major.cost : [major.cost ?? {}]
      return costs.reduce((m, c) => Math.max(m, (c as Record<string, number>).clay ?? 0), 0)
    }
  }
  return 0
}

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

export const D80_BrickHammer_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
