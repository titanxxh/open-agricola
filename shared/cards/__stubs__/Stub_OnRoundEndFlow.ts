import type { CardEffect } from '../card-effects'

export const CARD_ID = 'Stub_OnRoundEndFlow'

export const effect: CardEffect = {
  id: CARD_ID,
  onRoundEnd: () => ({
    type: 'leaf',
    actionId: 'gain',
    sourceCard: CARD_ID,
    params: { wood: 1 },
  }),
}
