import { writeCardExtraData, readCardExtraData, writeCardInfobox, setCardFlag, isCardFlagged } from '../helpers/card-state'
import { getFenceCount, maxFences } from '../../actions/effects/fencing'
import { workersAvailable } from '../../domain/player'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import type { CardImpl } from '../registry'
import { A22_Telegram } from '../../cards-display/A/A22_Telegram'
export { A22_Telegram }

const CARD_ID = A22_Telegram.id

registerPrerequisite('At Least 1 Fence in Supply', (player) => maxFences - getFenceCount(player) >= 1)

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
  reaches: [] as readonly string[],
} satisfies CardImpl
