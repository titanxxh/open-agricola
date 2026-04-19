import type { CardEffect } from '../card-effects'
import { incCounter } from './helpers'

export const CARD_ID = 'Stub_HarvestFieldPhase'

export const effect: CardEffect = {
  id: CARD_ID,
  onStartHarvestFieldPhase: (_state, player) => {
    incCounter(player, CARD_ID, 'startFieldCount')
  },
  onHarvestFieldPhase: (_state, player) => {
    incCounter(player, CARD_ID, 'duringFieldCount')
  },
  onEndHarvestFieldPhase: (_state, player) => {
    incCounter(player, CARD_ID, 'endFieldCount')
  },
}
