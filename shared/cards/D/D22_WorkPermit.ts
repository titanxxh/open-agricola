import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { queueFutureMeeplesFlow } from '../../actions/effects/future-meeples'
import {
  isCardFlagged,
  readCardExtraData,
  setCardFlag,
  writeCardExtraData,
  writeCardInfobox,
} from '../helpers/card-state'
import type { ActionFlow } from '../../game/types'

const CARD_ID = 'D22_WorkPermit'
const TARGET_ROUND_KEY = 'targetRound'

/**
 * D22 Work Permit (Minor, D, 22):
 * - onBuy: target round = current round + (wood + clay + stone + reed) in supply.
 *   If target round <= 14, mark that round with a future meeple entry and offer
 *   the player a bonus person at that round.
 * - onRoundStart (at target round): offer an optional `place-farmer` leaf so
 *   the player can place one extra person.
 *
 * Mirrors A22 Telegram exactly, but counts building resources (wood/clay/stone/reed)
 * instead of fences.
 *
 * BGA: see D22_WorkPermit.php lines 44-63 (onBuy counts reserve resources;
 * placeFutureFarmer moves a farmer to the target round's space) and lines 86-90
 * (activate flags the card to allow an extra placement in that round).
 */
registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    const buildingResources =
      (player.resources.wood ?? 0) +
      (player.resources.clay ?? 0) +
      (player.resources.stone ?? 0) +
      (player.resources.reed ?? 0)
    if (buildingResources <= 0) return
    const targetRound = Math.min(14, state.round + buildingResources)
    writeCardExtraData(player, CARD_ID, TARGET_ROUND_KEY, targetRound)
    writeCardInfobox(player, CARD_ID, `Round ${targetRound}`)
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: [{ round: targetRound, resources: {} }],
    })
  },
  onRoundStart: (state, player) => {
    const targetRound = readCardExtraData<number>(
      player,
      CARD_ID,
      TARGET_ROUND_KEY,
    )
    if (targetRound !== state.round) return
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
    } as ActionFlow
  },
})

export const D22_WorkPermit = new MinorImprovement({
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
})
