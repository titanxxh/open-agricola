import { defineMinorCard } from '../card-source'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import {
  isCardFlagged,
  readCardExtraData,
  writeCardExtraData,
  writeCardInfobox,
} from '../helpers/card-state'
import { hasInactiveWorkerInSupply } from '../../domain/player'
import { reserveSupplyWorker, releaseSupplyWorker } from '../../domain/supply-workers'
import { supplyWorkerTurnFlow, consumeSupplyWorkerTurn } from '../helpers/supply-worker-flow'
import type { CardImpl } from '../registry'

const CARD_ID = 'D022_WorkPermit'
const TARGET_ROUND_KEY = 'targetRound'

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
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: [{ round: targetRound, resources: {} }],
    })
  },
  onBeforeStartOfTurn: (state, player) => {
    if (readCardExtraData<number>(player, CARD_ID, TARGET_ROUND_KEY) !== state.round) return
    const workerId = readCardExtraData<string>(player, CARD_ID, 'reservedWorkerId')
    const worker = player.workers.find((entry) => entry.id === workerId)
    if (worker?.supplyUse?.sourceCard === CARD_ID) releaseSupplyWorker(state, player, worker)
    writeCardExtraData(player, CARD_ID, 'reservedWorkerId', undefined)
  },
  extraTurnBeforeWorkers: true,
  contributeExtraTurn: (state, player) => {
    if (readCardExtraData<number>(player, CARD_ID, TARGET_ROUND_KEY) !== state.round) return
    if (isCardFlagged(player, CARD_ID) || !hasInactiveWorkerInSupply(player)) return
    return supplyWorkerTurnFlow(state, player, CARD_ID, [consumeSupplyWorkerTurn(CARD_ID)])
  },
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
