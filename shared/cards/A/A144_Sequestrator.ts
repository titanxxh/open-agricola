import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { initCardState, incCounter } from '../__stubs__/helpers'

const CARD_ID = 'A144_Sequestrator'

const fencingListener: CardListenerRegistration = {
  id: 'A144-sequestrator-after-fencing',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['fence'],
  scope: 'any',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const owner = context.state.players.find(p =>
      p.occupationPlayed.includes(CARD_ID),
    )
    if (!owner) return
    const counters = initCardState(owner, CARD_ID)
    const reedLeft = counters['reed'] ?? 0
    if (reedLeft <= 0) return
    if (context.player.pastures.length < 3) return
    const amount = reedLeft
    counters['reed'] = 0
    incCounter(owner, CARD_ID, 'triggerCount')
    return {
      flow: { type: 'leaf', actionId: 'gain', params: { reed: amount } },
      logKey: 'log.cardEffectGain',
      logParams: { gain: { reed: amount }, cardId: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

const plowListener: CardListenerRegistration = {
  id: 'A144-sequestrator-after-plow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['plow'],
  scope: 'any',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const owner = context.state.players.find(p =>
      p.occupationPlayed.includes(CARD_ID),
    )
    if (!owner) return
    const counters = initCardState(owner, CARD_ID)
    const clayLeft = counters['clay'] ?? 0
    if (clayLeft <= 0) return
    if (context.player.fields.length < 5) return
    const amount = clayLeft
    counters['clay'] = 0
    incCounter(owner, CARD_ID, 'triggerCount')
    return {
      flow: { type: 'leaf', actionId: 'gain', params: { clay: amount } },
      logKey: 'log.cardEffectGain',
      logParams: { gain: { clay: amount }, cardId: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(fencingListener)
registerCardListener(plowListener)

import { registerCardEffect } from '../card-effects'

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    const counters = initCardState(player, CARD_ID)
    counters['reed'] = 3
    counters['clay'] = 4
  },
})

export const A144_Sequestrator = new Occupation({
  id: CARD_ID,
  name: "Sequestrator",
  deck: "A",
  number: 144,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Place 3 <REED> and 4 <CLAY> on this card. The next player to have 3 pastures/5 field tiles gets the 3 <REED>/4 <CLAY> (not retroactively)."],
  cost: {},
  players: "3+",
  newSet: true,
})
