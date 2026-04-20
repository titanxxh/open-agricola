import { MinorImprovement } from '../types'
import { writeCardExtraData, readCardExtraData, writeCardInfobox, setCardFlag, isCardFlagged } from '../helpers/card-state'
import { getFenceCount } from '../../actions/effects/fencing'
import type { CardImpl } from '../registry'

const CARD_ID = 'A22_Telegram'

export const A22_Telegram = new MinorImprovement({
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
})

export const A22_Telegram_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const fencesInSupply = getFenceCount(player)
    const targetRound = state.round + fencesInSupply
    if (targetRound <= 14) {
      writeCardExtraData(player, CARD_ID, 'triggerRound', targetRound)
      writeCardInfobox(player, CARD_ID, `Round ${targetRound}`)
    }
  },
  onBeforeStartOfTurn: (state, player) => {
    const triggerRound = readCardExtraData<number>(player, CARD_ID, 'triggerRound')
    if (triggerRound === undefined || state.round !== triggerRound) return
    // Check if player has a farmer in reserve (familySize > workersAvailable means
    // some are placed; we need workersAvailable < familySize actually is not what we want.
    // The BGA checks hasFarmerInReserve which is workersAvailable > 0 type check.
    // Actually for Telegram, BGA checks supply farmers. In standard Agricola,
    // you start with 5 farmers in supply and 2 in play. The card lets you place one from supply.
    // This is equivalent to a temporary family growth for that round only.
    // Since we can't easily undo family growth, we just offer a free place-farmer action.
    // The BGA version uses flagCardNode + checks, but in our system we can simply
    // offer a place-farmer leaf.
    if (isCardFlagged(player, CARD_ID)) return
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
  reaches: [] as readonly string[],
} satisfies CardImpl
