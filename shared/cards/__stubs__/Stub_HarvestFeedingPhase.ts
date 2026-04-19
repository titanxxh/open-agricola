import type { CardEffect } from '../card-effects'
import { incCounter } from './helpers'

export const CARD_ID = 'Stub_HarvestFeedingPhase'

export const effect: CardEffect = {
  id: CARD_ID,
  onStartHarvestFeedingPhase: (_state, player) => {
    incCounter(player, CARD_ID, 'startFeedCount')
  },
  onHarvestFeedingPhase: (_state, player) => {
    incCounter(player, CARD_ID, 'duringFeedCount')
  },
  onEndHarvestFeedingPhase: (_state, player) => {
    incCounter(player, CARD_ID, 'endFeedCount')
  },
}
