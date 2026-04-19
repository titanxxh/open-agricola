import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { writeCardExtraData, readCardExtraData, writeCardInfobox, setCardFlag, isCardFlagged } from '../helpers/card-state'
import { getFenceCount } from '../../actions/effects/fencing'

const CARD_ID = 'A22_Telegram'

/**
 * A22 Telegram:
 * - onBuy: Calculate target round = current round + fences in supply. Store it.
 *          If target round <= 14, mark that round. Show infobox.
 * - onBeforeStartOfTurn (at target round): if player has a farmer in reserve
 *   (familySize > workersAvailable scenario won't work — this is about extra placement from supply).
 *   The BGA version flags the card, which allows placing an extra person.
 *   In our system, the closest is granting an extra place-farmer action.
 *
 * BGA:
 * - onBuy: triggerRound = current turn + fences in supply (capped at 14)
 * - StartOfTurn at triggerRound: flag card → allows extra placement
 * - activate → independent action that adds place-farmer node
 *
 * Implementation: onBuy stores triggerRound in extraData.
 * onBeforeStartOfTurn at that round returns an optional place-farmer leaf flow.
 */

registerCardEffect({
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
})

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
