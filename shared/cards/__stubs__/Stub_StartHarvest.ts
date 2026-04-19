import type { CardEffect } from '../card-effects'
import { incCounter } from './helpers'

export const CARD_ID = 'Stub_StartHarvest'

export const effect: CardEffect = {
  id: CARD_ID,
  onStartHarvest: (_state, player) => {
    incCounter(player, CARD_ID, 'observedCount')
  },
}
