import { defineMinorCard } from '../card-source'
import {
  writeCardExtraData,
  writeCardInfobox,
} from '../helpers/card-state'
import { hasInactiveWorkerInSupply } from '../../domain/player'
import { reserveSupplyWorker } from '../../domain/supply-workers'
import { timedExtraTurnFlow } from '../timed-rule-obligations'
import type { RuleBody, TimedRule } from '../../contract/rule-plans'
import type { CardImpl } from '../registry'

const CARD_ID = 'D022_WorkPermit'
const TARGET_ROUND_KEY = 'targetRound'
const supplyTurnBody = { kind: 'operation', operation: { kind: 'supply-worker-turn' } } satisfies RuleBody

const supplyTurnRules = [{ retainAfterCardLeaves: true, key: 'scheduled-supply-turn', at: { kind: 'supply-worker-round', fact: 'targetRound', phase: 'contributeExtraTurn' }, body: supplyTurnBody }] satisfies readonly TimedRule[]

const cardImpl = {
  prerequisiteCheck: (player) => {
    const totalBuildRes =
      (player.resources.wood ?? 0)
      + (player.resources.stone ?? 0)
      + (player.resources.clay ?? 0)
      + (player.resources.reed ?? 0)
    if (totalBuildRes === 0) return false
    return hasInactiveWorkerInSupply(player)
  },
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const buildingResources =
      (player.resources.wood ?? 0) +
      (player.resources.clay ?? 0) +
      (player.resources.stone ?? 0) +
      (player.resources.reed ?? 0)
    if (buildingResources <= 0) return
    const targetRound = state.round + buildingResources
    if (targetRound > 14) return
    const worker = reserveSupplyWorker(player, CARD_ID)
    if (!worker) return
    writeCardExtraData(player, CARD_ID, 'reservedWorkerId', worker.id)
    writeCardExtraData(player, CARD_ID, TARGET_ROUND_KEY, targetRound)
    writeCardInfobox(player, CARD_ID, `Round ${targetRound}`)
  },
  timedRules: [
    { retainAfterCardLeaves: true, key: 'release-supply-reservation', at: { kind: 'card-round', fact: TARGET_ROUND_KEY, phase: 'onRoundStart' }, body: { kind: 'operation', operation: { kind: 'release-reserved-worker', workerFact: 'reservedWorkerId' } } },
    ...supplyTurnRules,
  ],
  extraTurnBeforeWorkers: true,
  contributeExtraTurn: (state, player) => timedExtraTurnFlow(state, player, CARD_ID, supplyTurnRules),
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D022_WorkPermit = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Work Permit',
    deck: 'D',
    number: 22,
    category: 'ACTIONS_BOOSTER',
    desc: [
        'Add 1 to the current round for each building resource you have and place 1 person from your supply on the corresponding round space. In that round, you can use the person.',
      ],
    cost: { food: 1 },
    prerequisite: 'At Least 1 Building Resource',
    evenMoreSet: true,
  },
  impl: cardImpl,
})

export const D022_WorkPermit_impl = D022_WorkPermit.impl
