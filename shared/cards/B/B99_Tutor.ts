import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import type { CardImpl } from '../registry'
import { B99_Tutor } from '../../cards-display/B/B99_Tutor'

const CARD_ID = B99_Tutor.id

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
