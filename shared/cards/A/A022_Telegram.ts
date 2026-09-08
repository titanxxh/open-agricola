import { defineMinorCard } from '../card-source'
import { writeCardExtraData, readCardExtraData, writeCardInfobox, isCardFlagged } from '../helpers/card-state'
import { getOwnOrdinaryFenceReserveCount } from '../../domain/supply-tokens'
import { hasInactiveWorkerInSupply } from '../../domain/player'
import { supplyWorkerTurnFlow, consumeSupplyWorkerTurn } from '../helpers/supply-worker-flow'
import type { CardImpl } from '../registry'

const CARD_ID = 'A022_Telegram'

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
  extraTurnBeforeWorkers: true,
  contributeExtraTurn: (state, player) => {
    if (readCardExtraData<number>(player, CARD_ID, 'triggerRound') !== state.round) return
    if (isCardFlagged(player, CARD_ID) || !hasInactiveWorkerInSupply(player)) return
    return supplyWorkerTurnFlow(state, player, CARD_ID, [consumeSupplyWorkerTurn(CARD_ID)])
  },
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
