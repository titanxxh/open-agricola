import type { CardEffect } from '../card-effects'
import { incCounter } from './helpers'

export const CARD_ID = 'Stub_OnRoundEnd'

export const effect: CardEffect = {
  id: CARD_ID,
  onRoundEnd: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    incCounter(player, CARD_ID, 'triggerCount')
  },
}
