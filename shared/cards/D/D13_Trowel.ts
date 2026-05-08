import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getRenovation } from '../../actions/effects/renovation'
import type { CardImpl } from '../registry'
import { D13_Trowel } from '../../cards-display/D/D13_Trowel'

const CARD_ID = D13_Trowel.id

/**
 * D13 Trowel — MinorImprovement (cost: 1 wood).
 * At any time, you can renovate your house to stone.
 * From a wooden house: costs 1 stone, 1 reed, and 1 food per room.
 * From a clay house: costs 1 stone per room.
 *
 * BGA: isListeningTo → anytime. onPlayerAtAnytime → renovation with toStone=true.
 * onPlayerComputeCostsRenovation → if actionCardId === D13_Trowel, apply custom costs:
 *   wood house: stone=1, food=1, reed=rooms per room (overrides base cost entirely).
 *   clay house: stone=1 per room, no reed (removes reed from fee).
 *
 * Simplified implementation:
 * - For clay house: anytime renovate-house with -1 reed discount (removes reed cost,
 *   since clay→stone base is { stone: rooms, reed: 1 }, Trowel makes it { stone: rooms }).
 * - For wood house: anytime renovate-house with sourceCard=D13 (goes wood→clay normally,
 *   with costs: { stone: 1 per room, food: 1 per room, reed: rooms } which replaces
 *   base cost { clay: rooms, reed: 1 } via computeCosts override).
 *
 * NOTE: The BGA toStone mechanic (wood→stone in one step) cannot be fully replicated
 * without engine changes. This simplified version offers the anytime renovation
 * with appropriate cost adjustments for each house type.
 *
 * DONE_WITH_CONCERNS: Wood house renovation goes clay (not stone) because the engine
 * only supports sequential upgrades. Clay house renovation correctly goes to stone
 * with no reed cost.
 */

// Anytime listener: offer renovation when not already stone
const anytimeListener: CardListenerRegistration = {
  id: 'D13-trowel-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.player.houseType === 'stone') return
    const renovation = getRenovation(context.player)
    if (!renovation) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'renovate-house',
        sourceCard: CARD_ID,
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.D13_Trowel.anytime',
    }
  },
}

const computeCostsListener: CardListenerRegistration = {
  id: 'D13-trowel-compute-costs-renovation',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.sourceCard !== CARD_ID) return
    const houseType = context.player.houseType
    const rooms = context.player.rooms
    if (houseType === 'clay') {
      // Clay→Stone: BGA cost = 1 stone per room, no reed.
      // Base: { stone: rooms, reed: 1 }
      // Apply: { reed: -1 } to remove reed cost (stone stays).
      return { costs: { reed: -1 } }
    }
    if (houseType === 'wood') {
      // Wood→Clay: BGA intends wood→stone in one step: cost = 1 stone+food+reed per room.
      // Base: { clay: rooms, reed: 1 }
      // Override: remove clay entirely, add stone=rooms, food=rooms, reed=rooms.
      // Simplification: { clay: -rooms, stone: rooms, food: rooms, reed: rooms - 1 }
      return {
        costs: {
          clay: -rooms,
          stone: rooms,
          food: rooms,
          reed: rooms - 1, // base has reed:1, we want reed:rooms → delta = rooms-1
        },
      }
    }
  },
}

export const D13_Trowel_impl = {
  listeners: [anytimeListener, computeCostsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
