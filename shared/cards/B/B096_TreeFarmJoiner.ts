import { defineOccupationCard } from '../card-source'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { timedEventFlow } from '../timed-rule-obligations'
import type { RuleBody, TimedRule } from '../../contract/rule-plans'
import type { CardImpl } from '../registry'

const CARD_ID = 'B096_TreeFarmJoiner'

const improvementBody = { kind: 'optional', body: { kind: 'action', actionId: 'improvement', params: { types: ['minor'] }, policy: { trueAction: false } } } satisfies RuleBody

const timedRules = [{ retainAfterCardLeaves: true, key: 'after-scheduled-wood', at: { kind: 'future-source', phase: 'afterReceive' }, body: improvementBody }] satisfies readonly TimedRule[]

const receiveListener: CardListenerRegistration = {
  id: 'B96-tree-farm-joiner-after-future-wood-receive',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['receive'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const flow = timedEventFlow(context, CARD_ID, timedRules, 'afterReceive')
    return flow ? { flow, sourceCard: CARD_ID } : undefined
  },
}

const cardImpl = {
  listeners: [receiveListener],
  effect: {
  id: CARD_ID,
  timedRules,
  onBuy: (state, player) => {
    const cur = state.round
    // Find next 2 odd round numbers > current
    const oddRounds: number[] = []
    for (let r = cur + 1; r <= 14 && oddRounds.length < 2; r++) {
      if (r % 2 !== 0) oddRounds.push(r)
    }
    if (oddRounds.length === 0) return
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: oddRounds.map((round) => ({ round, resources: { wood: 1 } })),
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B096_TreeFarmJoiner = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Tree Farm Joiner',
    deck: 'B',
    number: 96,
    category: 'ACTIONS_BOOSTER',
    desc: ['Place 1 <WOOD> on each of the next 2 odd-numbered round spaces. At the start of these rounds, you get the <WOOD> and, immediately afterward, a __Minor Improvement__ action.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const B096_TreeFarmJoiner_impl = B096_TreeFarmJoiner.impl
