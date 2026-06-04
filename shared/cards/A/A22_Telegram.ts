import { defineMinorCard } from '../card-source'
import { writeCardExtraData, readCardExtraData, writeCardInfobox, setCardFlag, isCardFlagged } from '../helpers/card-state'
import { getOwnOrdinaryFenceReserveCount } from '../../domain/supply-tokens'
import { workersAvailable } from '../../domain/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'A22_Telegram'

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
  onBeforeStartOfTurn: (state, player) => {
    const triggerRound = readCardExtraData<number>(player, CARD_ID, 'triggerRound')
    if (triggerRound === undefined || state.round !== triggerRound) return
    if (isCardFlagged(player, CARD_ID)) return
    // BGA `Telegram::activate` checks `hasFarmerInReserve` before inserting the
    // extra-placement node — without an unplaced worker, the trigger is wasted
    // (and the player loses the once-per-game flag). We mirror that guard via
    // `workersAvailable(state, player)`.
    if (workersAvailable(state, player) === 0) return
    setCardFlag(player, CARD_ID, true)
    return {
      type: 'seq',
      optional: true,
      children: [
        {
          type: 'leaf',
          actionId: 'place-farmer',
          sourceCard: CARD_ID,
          actionContext: { trueAction: false, extraPlacement: true },
        },
      ],
    }
  },
},
  prerequisiteCheck: (player) => getOwnOrdinaryFenceReserveCount(player) >= 1,
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A22_Telegram = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Telegram',
    deck: 'A',
    number: 22,
    category: 'ACTIONS_BOOSTER',
    desc: ['Add 1 to the current round for each fence in your supply and mark the corresponding round space. In that round only, you can place a person from your supply.'],
    cost: { food: 2 },
    prerequisite: 'At Least 1 Fence in Supply',
    vp: 1,
    evenMoreSet: true,
  },
  impl: cardImpl,
})

export const A22_Telegram_impl = A22_Telegram.impl
