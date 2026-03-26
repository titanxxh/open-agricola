import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'C144_ReedRoofRenovator'

const listener: CardListenerRegistration = {
  id: 'C144-reed-roof-renovator-after-renovate',
  cardIds: [CARD_ID],
  phases: ['immediatelyAfter' as ActionHookPhase],
  actions: ['renovate-house'],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    return {
      flow: { type: 'leaf', actionId: 'gain', params: { reed: 1 }, sourceCard: CARD_ID },
      logKey: 'log.cardEffectGain',
      logParams: { gain: { reed: 1 }, cardId: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const C144_ReedRoofRenovator = new Occupation({
  id: CARD_ID,
  name: "Reed Roof Renovator",
  deck: "C",
  number: 144,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: [
    "Each time another player renovates, you immediately get 1 <REED> from the general supply.",
    "When you play this card in a 3-player game, you immediately get 1 <REED>.",
  ],
  players: "3+",
})
