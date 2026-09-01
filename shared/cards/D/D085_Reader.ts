import { defineOccupationCard } from '../card-source'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'D085_Reader'
const OCCUPATION_THRESHOLD_KEY = 'occupationThreshold'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      writeCardExtraData(
        player,
        CARD_ID,
        OCCUPATION_THRESHOLD_KEY,
        state.draftMode === 'simultaneous' ? 7 : 6,
      )
    },
    computeExtraRoomCapacity: (player) => {
      const threshold = readCardExtraData<number>(
        player,
        CARD_ID,
        OCCUPATION_THRESHOLD_KEY,
      ) ?? 6
      return player.occupationPlayed.length >= threshold ? 1 : 0
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D085_Reader = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Reader',
    deck: 'D',
    number: 85,
    category: 'FARM_PLANNER',
    desc: [
        'As soon as you have 6 (7 in draft mode) occupations in front of you (including this one), this card provides room for one person.',
      ],
    rules: ['In simultaneous draft mode, the occupation threshold is fixed at 7, regardless of draft pool size.'],
    cost: {},
    players: '1+',
    evenMoreSet: true,
  },
  impl: cardImpl,
})

export const D085_Reader_impl = D085_Reader.impl
