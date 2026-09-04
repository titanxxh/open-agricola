import { defineMinorCard } from '../card-source'
import { readCardExtraData, writeCardExtraData, writeCardInfobox } from '../helpers/card-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'E028_Bookmark'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const triggerRound = state.round + 3
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
          actionId: 'occupation',
          sourceCard: CARD_ID,
          params: { exactCost: {} },
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E028_Bookmark = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Bookmark',
    deck: 'E',
    number: 28,
    desc: ['Add 3 to the current round and mark the corresponding round space. At the start of that round, you can play 1 occupation without paying an occupation cost.'],
    cost: { wood: 1 },
    category: 'ACTION_-_OCCUPATION',
  },
  impl: cardImpl,
})

export const E028_Bookmark_impl = E028_Bookmark.impl
