import { Occupation } from '../types'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'B99_Tutor'

export const B99_Tutor = new Occupation({
  id: CARD_ID,
  name: "Tutor",
  deck: "B",
  number: 99,
  category: "POINTS_PROVIDER",
  desc: ['During scoring, you get 1 bonus <SCORE> for each occupation played after this one.'],
  cost: {},
  players: "1+",
})

export const B99_Tutor_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    writeCardExtraData(player, CARD_ID, 'playedAtCount', player.occupationPlayed.length)
  },
  computeBonusScore: (_state, player) => {
    const playedAt = readCardExtraData<number>(player, CARD_ID, 'playedAtCount') ?? 0
    return Math.max(0, player.occupationPlayed.length - playedAt)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
