import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getPrintedImprovementResourceCost } from '../../actions/helpers/improvement-helpers'
import type { CardImpl } from '../registry'

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

const hasPrintedClayCost = (cardId: string): boolean =>
  getPrintedImprovementResourceCost(cardId, 'clay') > 0

const getBuiltCardId = (choice: string | undefined): string | undefined => {
  if (!choice) return undefined
  return choice.replace(/^major:/, '').replace(/^minor:/, '')
}

const listener: CardListenerRegistration = {
  id: 'E156-claypit-owner-opponent-improvement-clay',
  cardIds: [CARD_ID],
  actions: ['improvement'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const builtCardId = getBuiltCardId(context.choice)
    if (!builtCardId) return
    if (!hasPrintedClayCost(builtCardId)) return
    return { flow: gainLeaf(CARD_ID, { food: 1, clay: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E156_ClaypitOwner = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Claypit Owner',
    deck: 'E',
    number: 156,
    category: 'GOODS_-_GET',
    desc: [
        'Each time another player plays or builds an improvement with a printed <CLAY> cost, you get 1 <FOOD> and 1 <CLAY>.',
      ],
    cost: {},
    players: '4+',
  },
  impl: cardImpl,
})

export const E156_ClaypitOwner_impl = E156_ClaypitOwner.impl
