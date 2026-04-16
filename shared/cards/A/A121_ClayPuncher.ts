import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'A121_ClayPuncher'

/**
 * A121 Clay Puncher — On buy: gain 1 clay.
 * Each time you use a Lessons action space or the Clay Pit accumulation space,
 * you get 1 clay.
 *
 * BGA reference: A_121_ClayPuncher.php
 * BGA checks actionCardType in ['Lessons', 'ClayPit']
 */
registerCardEffect({
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { clay: 1 }),
})

const TRIGGER_SPACES = ['lessons', 'lessons-2', 'lessons-4', 'clay-pit']

const listener: CardListenerRegistration = {
  id: 'A121-clay-puncher-after-lessons-clay',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || !TRIGGER_SPACES.includes(context.space.id)) return
    return { flow: gainLeaf(CARD_ID, { clay: 1 }), sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

export const A121_ClayPuncher = new Occupation({
  id: CARD_ID,
  name: "Clay Puncher",
  deck: "A",
  number: 121,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: [
    "When you play this card and each time after you use a __Lessons__ action space or the __Clay Pit__ accumulation space, you get 1 <CLAY>.",
  ],
  cost: {},
  players: "1+",
  newSet: true,
})
