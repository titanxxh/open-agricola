import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookResult } from '../../actions/hooks'
import { writeCardExtraData, writeCardInfobox } from '../helpers/card-state'
import { timedEventFlow } from '../timed-rule-obligations'
import type { RuleBody, TimedRule } from '../../contract/rule-plans'
import type { CardImpl } from '../registry'

const CARD_ID = 'E140_Carter'
const collectRewardBody = { kind: 'operation', operation: { kind: 'gain-per-building-resource-collected', resource: 'food', perBuildingResource: 1 } } satisfies RuleBody
const timedRules = [{ retainAfterCardLeaves: true, key: 'next-round-collection-window', at: { kind: 'round-window', fact: 'triggerRound', phase: 'afterCollect' }, body: collectRewardBody }] satisfies readonly TimedRule[]

const afterCollectListener: CardListenerRegistration = {
  id: 'E140-carter-after-collect',
  cardIds: [CARD_ID],
  phases: ['after'],
  actionSpaces: 'all',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const flow = timedEventFlow(context, CARD_ID, timedRules, 'afterCollect')
    return flow ? { flow, sourceCard: CARD_ID } : undefined
  },
}

const cardImpl = {
  listeners: [afterCollectListener],
  effect: {
  id: CARD_ID,
  timedRules,
  onBuy: (state, player) => {
    const triggerRound = state.round + 1
    writeCardExtraData(player, CARD_ID, 'triggerRound', triggerRound)
    writeCardInfobox(player, CARD_ID, `Active: Round ${triggerRound}`)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E140_Carter = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Carter',
    deck: 'E',
    number: 140,
    desc: ['Next round, each time you use a building resource accumulation space, you also get 1 <FOOD> for each building resource that you take from the space.'],
    cost: {},
    players: '3+',
    category: 'FOOD',
  },
  impl: cardImpl,
})

export const E140_Carter_impl = E140_Carter.impl
