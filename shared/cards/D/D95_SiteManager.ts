import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { Resource } from '../../game/types'
import { getMajorCardEffect } from '../major'
import { getMinorImprovement } from '../../game/minor-improvements'

const CARD_ID = 'D95_SiteManager'

/**
 * D95 Site Manager (Occupation, 1+ players).
 *
 * BGA (D95_SiteManager.php): When you play this card, immediately build a major
 * improvement. When paying its cost, you can replace up to 1 building resource
 * of each type (wood/clay/stone/reed) with 1 FOOD each.
 *
 * BGA implementation:
 *   - onBuy → flag card, optional improvement-any (MAJOR), unflag.
 *   - onPlayerComputeCardCosts: if flagged, enumerate 2^4-1 combinations of
 *     resource substitutions to add to the trade list.
 *
 * Our engine uses flat cost overrides (not trade-list enumeration). We apply a
 * greedy substitution: for each of wood/clay/stone/reed present in the base
 * cost, if the player lacks that resource but has a spare FOOD to cover the
 * shortfall, replace 1 unit of it with 1 FOOD. This matches the spirit
 * (fund building-resource cost with food) in the common case where the player
 * needs the substitution, while avoiding unhelpful forced food spending when
 * the player already has the resources.
 *
 * Known limitation: does NOT expose the full combinatorial trade space to the
 * player (would require engine changes to payment-choice generation). If the
 * player has all required resources, no substitution is offered (matching the
 * "up to" wording).
 */

const BUILDING_RESOURCES: (keyof Resource)[] = ['wood', 'clay', 'stone', 'reed']

const onBuyListener: CardListenerRegistration = {
  id: 'D95-site-manager-onbuy',
  cardIds: [CARD_ID],
  actions: ['play-occupation'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.choice !== CARD_ID) return
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'improvement-any',
        optional: true,
        sourceCard: CARD_ID,
        actionContext: { trueAction: false },
        params: {
          types: ['major'],
        } as any,
      },
      sourceCard: CARD_ID,
    }
  },
}

const computeCostsListener: CardListenerRegistration = {
  id: 'D95-site-manager-compute-costs',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement-any', 'minor-improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (context.actionCardId !== CARD_ID) return
    if (!context.cardId) return

    // Greedy substitution: find resources the player lacks; substitute from food.
    // We cannot read baseCost directly from context; instead we compute
    // what the player "needs" vs "has" by inspecting the improvement's base cost.
    // Access via major/minor registry without causing circular deps.
    let baseCost: Partial<Resource> = {}
    const major = getMajorCardEffect(context.cardId)
    if (major?.cost) {
      const costs = Array.isArray(major.cost) ? major.cost[0] : major.cost
      baseCost = { ...(costs as Partial<Resource>) }
    } else {
      const minor = getMinorImprovement(context.cardId)
      if (minor?.cost) {
        baseCost = { ...(minor.cost as Partial<Resource>) }
      }
    }

    const delta: Partial<Resource> = {}
    let foodAvailable = context.player.resources.food ?? 0
    for (const res of BUILDING_RESOURCES) {
      const need = baseCost[res] ?? 0
      if (need <= 0) continue
      const have = context.player.resources[res] ?? 0
      const shortfall = need - have
      if (shortfall > 0 && foodAvailable >= 1) {
        // Substitute 1 unit of this resource with 1 food.
        delta[res] = (delta[res] ?? 0) - 1
        delta.food = (delta.food ?? 0) + 1
        foodAvailable -= 1
      }
    }

    if (Object.keys(delta).length === 0) return
    return { costs: delta }
  },
}

registerCardListener(onBuyListener)
registerCardListener(computeCostsListener)

export const D95_SiteManager = new Occupation({
  id: CARD_ID,
  name: 'Site Manager',
  deck: 'D',
  number: 95,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'When you play this card, immediately build a major improvement. When paying its cost, you can replace up to 1 building resource of each type with 1 <FOOD> each.',
  ],
  cost: {},
  players: '1+',
  evenMoreSet: true,
})
