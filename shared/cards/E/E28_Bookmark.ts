import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { readCardExtraData, writeCardExtraData, writeCardInfobox } from '../helpers/card-state'

const CARD_ID = 'E28_Bookmark'

/**
 * E28 Bookmark: Add 3 to the current round and mark the corresponding round space.
 * At the start of that round, you can play 1 occupation without paying an occupation cost.
 *
 * Implementation:
 * - onBuy: Store triggerRound = round + 3 in extraData. Update infobox.
 * - onBeforeStartOfTurn: If current round === triggerRound, return optional flow
 *   to play an occupation for free (costOverride: {}).
 */
registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    const triggerRound = Math.min(state.round + 3, 14)
    writeCardExtraData(player, CARD_ID, 'triggerRound', triggerRound)
    writeCardInfobox(player, CARD_ID, `Round ${triggerRound}`)
  },
  onBeforeStartOfTurn: (state, player) => {
    const triggerRound = readCardExtraData<number>(player, CARD_ID, 'triggerRound')
    if (triggerRound == null || state.round !== triggerRound) return
    // Only offer if player has occupations in hand
    if (player.occupationHand.length === 0) return
    return {
      type: 'seq',
      optional: true,
      children: [
        {
          type: 'leaf',
          actionId: 'play-occupation',
          sourceCard: CARD_ID,
          params: { costOverride: {} },
        },
      ],
    }
  },
})

export const E28_Bookmark = new MinorImprovement({
  id: CARD_ID,
  name: 'Bookmark',
  deck: 'E',
  number: 28,
  desc: ['Add 3 to the current round and mark the corresponding round space. At the start of that round, you can play 1 occupation without paying an occupation cost.'],
  cost: { wood: 1 },
})
