import { MinorImprovement } from '../types'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { playerBoard, type AnimalZone, getPastureCapacity } from '../../domain'
import type { CardImpl } from '../registry'

const CARD_ID = 'E33_BeaverColony'

// Reed-producing action spaces (accumulation + gain-type).
// BGA also checks ActionResourceMarket and specific cards (C104_Collector, E81_AlchemistsLab).
const REED_ACTION_SPACES = new Set(['reed-bank', 'resource-market-4'])

const afterCollectListener: CardListenerRegistration = {
  id: 'E33-beaver-colony-after-collect',
  cardIds: [CARD_ID],
  phases: ['immediatelyAfter' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const gained = context.result?.type === 'ok' ? (context.result.resourcesGained?.reed ?? 0) : 0
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
    if (!context.space || !REED_ACTION_SPACES.has(context.space.id)) return
    const gained = context.result?.type === 'ok' ? (context.result.resourcesGained?.reed ?? 0) : 0
    if (gained <= 0) return
    return {
      flow: { type: 'leaf', actionId: 'bonus-vp', params: { score: 1 }, sourceCard: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

export const E33_BeaverColony = new MinorImprovement({
  id: CARD_ID,
  name: "Beaver Colony",
  deck: "E",
  number: 33,
  category: "BONUS_POINTS_-_GET",
  desc: ['From now on, one of your pastures with stable cannot hold animals. Each time you get <REED> from an action space, you get 1\u00a0bonus <SCORE>.'],
  vp: 1,
  cost: {},
  prerequisite: "1 Fenced Stable",
})

export const E33_BeaverColony_impl = {
  listeners: [afterCollectListener, afterGainListener],
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const idx = state.players.indexOf(player)
    playerBoard(state, idx).animals.enforceCapacity()
  },
  onComputeAnimalZones: (player, zones) => {
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
  /**
   * BGA `Models/PlayerBoard.php::getInvalidAnimals` (E33 branch):
   * pasture-with-stable restriction. We enforce via `onComputeAnimalZones`
   * setting cap=0 on the smallest stabled pasture, which forces overflow
   * on reorg. Hook returns [] because the constraint is not card-zone-local.
   */
  getInvalidAnimals: () => [],
},
  reaches: [] as readonly string[],
} satisfies CardImpl
