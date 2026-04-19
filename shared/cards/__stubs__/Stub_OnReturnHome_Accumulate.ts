import type { CardEffect } from '../card-effects'
import { incCounter } from './helpers'

export const CARD_ID = 'Stub_OnReturnHome_Accumulate'

export const effect: CardEffect = {
  id: CARD_ID,
  onReturnHome: (_state, player) => {
    incCounter(player, CARD_ID, 'observedCount')
    incCounter(player, CARD_ID, 'grain')
  },
}
