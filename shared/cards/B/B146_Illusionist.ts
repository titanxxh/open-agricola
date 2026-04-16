import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../game/types'

const CARD_ID = 'B146_Illusionist'

/**
 * B146 Illusionist (Occupation, 3+):
 *
 * "Each time you use a building resource accumulation space, you can
 *  discard exactly 1 card from your hand to get 1 additional building
 *  resource of the accumulating type."
 *
 * BGA (B146_Illusionist.php lines 32-62):
 *   - isListeningTo: isBeforeCollectEvent for WOOD / CLAY / REED / STONE.
 *   - onPlayerPlaceFarmer: if hand is empty or Lantern House is in play,
 *     skip. Otherwise return an optional SEQ [selectCard, gainNode(resource=1)].
 *   - actSelectCard: destroys the chosen card and moves it to the box.
 *
 * Implementation:
 *   - Listener on `collect` phase `before`. Fires for any space whose
 *     `space.resources` has >0 wood/clay/reed/stone (this naturally scopes
 *     to the building-resource accumulation spaces: forest, copse, grove,
 *     clay-pit, reed-bank, eastern-quarry, western-quarry, etc.).
 *   - If `C35_LanternHouse` is played, skip (BGA ruling).
 *   - If the union of occupationHand + minorHand is empty, skip.
 *   - Return optional seq: [ discard-from-hand, gain({ resource: 1 }) ]. The
 *     `discard-from-hand` action presents each hand card as a dynamic choice
 *     option. No new pending-action type needed.
 */

const BUILDING_RESOURCES = ['wood', 'clay', 'reed', 'stone'] as const
type BuildingResource = (typeof BUILDING_RESOURCES)[number]

const pickAccumulatingResource = (
  resources: Record<string, number>,
): BuildingResource | null => {
  for (const r of BUILDING_RESOURCES) {
    if ((resources[r] ?? 0) > 0) return r
  }
  return null
}

const listener: CardListenerRegistration = {
  id: 'B146-illusionist-before-collect',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['collect'],
  scope: 'player',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    // BGA ruling: Lantern House disables Illusionist.
    if (context.player.occupationPlayed.includes('C35_LanternHouse')) return

    const hand = [
      ...(context.player.occupationHand ?? []),
      ...(context.player.minorHand ?? []),
    ]
    if (hand.length === 0) return

    const space = context.space
    if (!space) return
    const resource = pickAccumulatingResource(space.resources as Record<string, number>)
    if (!resource) return

    const flow: ActionFlow = {
      type: 'seq',
      optional: true,
      children: [
        {
          type: 'leaf',
          actionId: 'discard-from-hand',
          sourceCard: CARD_ID,
        },
        {
          type: 'leaf',
          actionId: 'gain',
          sourceCard: CARD_ID,
          params: { [resource]: 1 },
        },
      ],
    }
    return {
      flow,
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const B146_Illusionist = new Occupation({
  id: CARD_ID,
  name: 'Illusionist',
  deck: 'B',
  number: 146,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'Each time you use a building resource accumulation space, you can discard exactly 1 card from your hand to get 1 additional building resource of the accumulating type.',
  ],
  cost: {},
  players: '3+',
  evenMoreSet: true,
})
