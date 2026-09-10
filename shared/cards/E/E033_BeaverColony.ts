import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { playerBoard } from '../../domain'
import { areRequiredEmptyZoneGroupsSatisfied } from '../../domain/animal-zones'
import { sumResourceMovedToPlayer } from '../helpers/event-provenance'
import type { CardImpl } from '../registry'

const CARD_ID = 'E033_BeaverColony'
const REQUIRED_EMPTY_GROUP_ID = `${CARD_ID}:stabled-pastures`
const REED_ACTION_SPACES = new Set(['reed-bank', 'resource-market-4'])

const reedMovedFromActionSpace = (context: CardListenerContext): number => {
  const events = context.actionEvents ?? context.transactionEvents
  return sumResourceMovedToPlayer(events, 'reed', context.player.id, (event) =>
    event.from.kind === 'actionSpace',
  )
}

const afterCollectListener: CardListenerRegistration = {
  id: 'E33-beaver-colony-after-collect',
  cardIds: [CARD_ID],
  phases: ['immediatelyAfter' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (reedMovedFromActionSpace(context) <= 0) return
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
    if (reedMovedFromActionSpace(context) <= 0) return
    return {
      flow: { type: 'leaf', actionId: 'bonus-vp', params: { score: 1 }, sourceCard: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  prerequisiteCheck: (player) => player.pastures.some((pasture) => pasture.stables > 0),
  listeners: [afterCollectListener, afterGainListener],
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      const idx = state.players.indexOf(player)
      if (idx < 0) return
      if (areRequiredEmptyZoneGroupsSatisfied(playerBoard(state, idx).animals.zones())) return
      return { type: 'leaf', actionId: 'reorganize', sourceCard: CARD_ID }
    },
    onComputeAnimalZones: (player, zones, _state) => {
      for (const zone of zones) {
        if (
          zone.zoneType !== 'pasture'
          || typeof zone.pastureIndex !== 'number'
          || (player.pastures[zone.pastureIndex]?.stables ?? 0) <= 0
        ) continue
        zone.requiredEmptyZoneGroupIds ??= []
        if (!zone.requiredEmptyZoneGroupIds.includes(REQUIRED_EMPTY_GROUP_ID)) {
          zone.requiredEmptyZoneGroupIds.push(REQUIRED_EMPTY_GROUP_ID)
        }
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E033_BeaverColony = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Beaver Colony",
    deck: "E",
    number: 33,
    category: "BONUS_POINTS_-_GET",
    desc: ['From now on, one of your pastures with <STABLE> cannot hold animals. Each time you get <REED> from an action space, you get 1 bonus <SCORE>.'],
    vp: 1,
    cost: {},
    prerequisite: "1 Fenced Stable",
    extraVp: true,
  },
  impl: cardImpl,
})

export const E033_BeaverColony_impl = E033_BeaverColony.impl
