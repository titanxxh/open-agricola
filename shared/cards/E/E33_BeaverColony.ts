import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { registerCardEffect } from '../card-effects'
import { enforceAnimalCapacity, getPastureCapacity } from '../../actions/effects/animals'
import type { AnimalZone } from '../../actions/effects/animals'

const CARD_ID = 'E33_BeaverColony'

// Reed-producing action spaces (accumulation + gain-type).
// BGA also checks ActionResourceMarket and specific cards (C104_Collector, E81_AlchemistsLab).
const REED_ACTION_SPACES = new Set(['reed-bank', 'resource-market-4'])

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    enforceAnimalCapacity(player)
  },
  onComputeAnimalZones: (player, zones) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    const stabledPastures = zones.filter(
      (zone): zone is AnimalZone & { zoneType: 'pasture'; pastureIndex: number } =>
        zone.zoneType === 'pasture' &&
        typeof zone.pastureIndex === 'number' &&
        !!player.pastures[zone.pastureIndex] &&
        player.pastures[zone.pastureIndex]!.stables > 0,
    )
    if (stabledPastures.length === 0) return
    const blocked = stabledPastures.reduce((smallest, zone) => {
      const smallestPasture = player.pastures[smallest.pastureIndex]!
      const currentPasture = player.pastures[zone.pastureIndex]!
      return getPastureCapacity(currentPasture) < getPastureCapacity(smallestPasture)
        ? zone
        : smallest
    })
    blocked.blocked = true
    blocked.capacity = 0
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
  desc: ['From now on, one of your pastures with stable cannot hold animals. Each time you get <REED> from an action space, you get 1\u00a0bonus <SCORE>.'],
  vp: 1,
  cost: {},
  prerequisite: "1 Fenced Stable",
})
