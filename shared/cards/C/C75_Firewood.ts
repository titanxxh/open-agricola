import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { GameState, PlayerState } from '../../game/types'

const OVEN_IMPROVEMENTS = [
  'Major_Fireplace1',
  'Major_Fireplace2', 
  'Major_CookingHearth1',
  'Major_CookingHearth2',
  'Major_ClayOven',
  'Major_StoneOven',
  'E63_IronOven',
  'E64_SimpleOven',
  'D59_EarthOven',
]

const CARD_ID = 'C75_Firewood'

/**
 * C75_Firewood: In the returning home phase of each round, place 1 wood on this card.
 */
const firewoodReturnHomeEffect = {
  id: CARD_ID,
  onReturnHome: (state: GameState, player: PlayerState): void => {
    // Check if player has this card
    if (!player.minorPlayed.includes(CARD_ID)) return
    
    // Initialize cardStates if needed
    if (!player.cardStates) {
      player.cardStates = {}
    }
    if (!player.cardStates[CARD_ID]) {
      player.cardStates[CARD_ID] = { counters: {} }
    }
    if (!player.cardStates[CARD_ID].counters) {
      player.cardStates[CARD_ID].counters = {}
    }
    
    // Place 1 wood on this card
    const currentWood = player.cardStates[CARD_ID].counters!['wood'] ?? 0
    player.cardStates[CARD_ID].counters!['wood'] = currentWood + 1
  },
}

registerCardEffect(firewoodReturnHomeEffect)

/**
 * Hook for moving wood from card to supply after building an oven.
 * "Each time after you build a Fireplace, Cooking Hearth, or oven, 
 * move up to 4 <WOOD> from this card to your supply."
 */
const firewoodAfterBuildListener: CardListenerRegistration = {
  id: 'C75-firewood-after-build',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['buy-major', 'buy-minor'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { player, args } = context
    
    // Check if the built card is an oven
    const builtCardId = args?.cardId as string | undefined
    if (!builtCardId || !OVEN_IMPROVEMENTS.includes(builtCardId)) return
    
    // Check if there's wood on this card
    const woodOnCard = player.cardStates?.[CARD_ID]?.counters?.['wood'] ?? 0
    if (woodOnCard <= 0) return
    
    // Move up to 4 wood from card to supply
    const woodToMove = Math.min(woodOnCard, 4)
    
    // Update card state
    if (!player.cardStates) player.cardStates = {}
    if (!player.cardStates[CARD_ID]) player.cardStates[CARD_ID] = { counters: {} }
    if (!player.cardStates[CARD_ID].counters) player.cardStates[CARD_ID].counters = {}
    player.cardStates[CARD_ID].counters!['wood'] = woodOnCard - woodToMove
    
    // Add wood to player's supply
    player.resources.wood += woodToMove
    
    // Log the effect
    return {
      flow: {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'special-effect', optional: false },
        ],
      },
      log: { key: 'log.firewoodGain', params: { count: woodToMove } },
    }
  },
}

registerCardListener(firewoodAfterBuildListener)

export const C75_Firewood = new MinorImprovement({
  id: CARD_ID,
  name: "Firewood",
  deck: "C",
  number: 75,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["In the returning home phase of each round, place 1 <WOOD> on this card. Each time after you build a Fireplace, Cooking Hearth, or oven, move up to 4 <WOOD> from this card to your supply."],
  cost: {"food": 2},
})
