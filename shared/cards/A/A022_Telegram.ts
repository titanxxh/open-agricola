import { defineMinorCard } from '../card-source'
import { writeCardExtraData, writeCardInfobox } from '../helpers/card-state'
import { getOwnOrdinaryFenceReserveCount } from '../../domain/supply-tokens'
import { timedExtraTurnFlow } from '../timed-rule-obligations'
import type { RuleBody, TimedRule } from '../../contract/rule-plans'
import type { CardImpl } from '../registry'

const CARD_ID = 'A022_Telegram'
const supplyTurnBody = { kind: 'operation', operation: { kind: 'supply-worker-turn' } } satisfies RuleBody

const supplyTurnRules = [{ retainAfterCardLeaves: true, key: 'scheduled-supply-turn', at: { kind: 'supply-worker-round', fact: 'triggerRound', phase: 'contributeExtraTurn' }, body: supplyTurnBody }] satisfies readonly TimedRule[]

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const fencesInSupply = getOwnOrdinaryFenceReserveCount(player)
    const targetRound = state.round + fencesInSupply
    if (targetRound <= 14) {
      writeCardExtraData(player, CARD_ID, 'triggerRound', targetRound)
      writeCardInfobox(player, CARD_ID, `Round ${targetRound}`)
    }
  },
  timedRules: supplyTurnRules,
  extraTurnBeforeWorkers: true,
  contributeExtraTurn: (state, player) => timedExtraTurnFlow(state, player, CARD_ID, supplyTurnRules),
},
  prerequisiteCheck: (player) => getOwnOrdinaryFenceReserveCount(player) >= 1,
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A022_Telegram = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Telegram',
    deck: 'A',
    number: 22,
    category: 'ACTIONS_BOOSTER',
    desc: ['Add 1 to the current round for each <FENCE> in your supply and mark the corresponding round space. In that round only, you can place a person from your supply.'],
    cost: { food: 2 },
    prerequisite: 'At Least 1 Fence in Supply',
    vp: 1,
    evenMoreSet: true,
  },
  impl: cardImpl,
})

export const A022_Telegram_impl = A022_Telegram.impl
