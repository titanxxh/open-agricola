import type { CardEffect } from '../card-effects'
import { incCounter } from './helpers'

export const CARD_ID = 'Stub_EndHarvest'

export const effect: CardEffect = {
  id: CARD_ID,
  onEndHarvest: (_state, player) => {
    incCounter(player, CARD_ID, 'observedCount')
  },
}
