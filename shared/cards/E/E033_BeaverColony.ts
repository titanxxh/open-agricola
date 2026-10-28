import { defineMinorCard } from '../card-source'
import { getFencedStableCount, getPastureStableCount } from '../../domain/pasture'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookResult } from '../../actions/hooks'
import { playerBoard } from '../../domain'
import { areRequiredEmptyZoneGroupsSatisfied } from '../../domain/animal-zones'
import { sumActionSpaceMovedToPlayer } from '../helpers/event-provenance'
import { bonusVpLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E033_BeaverColony'
const REQUIRED_EMPTY_GROUP_ID = `${CARD_ID}:stabled-pastures`
const afterSpaceUseListener: CardListenerRegistration = {
  id: 'E33-beaver-colony-after-space-use',
  cardIds: [CARD_ID],
  phases: ['after'],
  actionSpaces: 'all',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (sumActionSpaceMovedToPlayer(context.actionEvents ?? context.transactionEvents, 'reed', context.player.id) <= 0) return
    return {
      flow: bonusVpLeaf(CARD_ID),
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  prerequisiteCheck: (player) => getFencedStableCount(player) > 0,
  listeners: [afterSpaceUseListener],
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
        ) continue
        const pasture = player.pastures[zone.pastureIndex]
        if (!pasture || getPastureStableCount(player, pasture) <= 0) continue
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
  presentation: { counters: ['bonusVp'] },
  impl: cardImpl,
})

export const E033_BeaverColony_impl = E033_BeaverColony.impl
