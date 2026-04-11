import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { registerCardEffect } from '../card-effects'
import { enforceAnimalCapacity } from '../../actions/effects/animals'

const CARD_ID = 'E33_BeaverColony'

// Reed-producing action spaces (accumulation + gain-type).
// BGA also checks ActionResourceMarket and specific cards (C104_Collector, E81_AlchemistsLab).
const REED_ACTION_SPACES = new Set(['reed-bank', 'resource-market-4'])

// BGA: on purchase, trigger animal reorg since a stabled pasture loses capacity.
// The pasture restriction is enforced via getBlockedPastureId() in animals.ts,
// which makes getPastureCapacity return 0 for the smallest stabled pasture.
registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    enforceAnimalCapacity(player)
  },
})

const afterCollectListener: CardListenerRegistration = {
  id: 'E33-beaver-colony-after-collect',
  cardIds: [CARD_ID],
  phases: ['immediatelyAfter' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    const gained = (context.result as any)?.resourcesGained?.reed ?? 0
    if (gained <= 0) return
    return {
      flow: { type: 'leaf', actionId: 'bonus-vp', params: { score: 1 }, sourceCard: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

const afterGainListener: CardListenerRegistration = {
  id: 'E33-beaver-colony-after-gain',
  cardIds: [CARD_ID],
  phases: ['immediatelyAfter' as ActionHookPhase],
  actions: ['gain'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    if (!context.space || !REED_ACTION_SPACES.has(context.space.id)) return
    const gained = (context.result as any)?.resourcesGained?.reed ?? 0
    if (gained <= 0) return
    return {
      flow: { type: 'leaf', actionId: 'bonus-vp', params: { score: 1 }, sourceCard: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(afterCollectListener)
registerCardListener(afterGainListener)

export const E33_BeaverColony = new MinorImprovement({
  id: CARD_ID,
  name: "Beaver Colony",
  deck: "E",
  number: 33,
  category: "BONUS_POINTS",
  desc: ["From now on, one of your pastures with stable cannot hold animals. Each time you get <REED> from an action space, you get 1 bonus <SCORE>."],
  vp: 1,
  cost: {},
  prerequisite: "1 Fenced Stable",
})
