import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { GameState, PlayerState, ActionChoiceOption } from '../../game/types'

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
 * Helper function to generate options for firewood exchange
 */
const generateFirewoodOptions = (woodOnCard: number): ActionChoiceOption[] => {
  const maxWood = Math.min(4, woodOnCard)
  if (maxWood <= 0) return []
  
  const options: ActionChoiceOption[] = []
  // Add skip option
  options.push({ value: '0', labelKey: 'ui.interactionFirewoodExchangeSkip' })
  // Add options for 1 to maxWood
  for (let i = 1; i <= maxWood; i++) {
    options.push({
      value: String(i),
      labelKey: 'ui.interactionFirewoodExchangeCount',
      labelParams: { count: i },
    })
  }
  return options
}

/**
 * Helper function to store pending choice in the generic location
 */
const storePendingChoice = (
  player: PlayerState,
  options: ActionChoiceOption[],
  promptKey: string,
): void => {
  if (!player.cardStates) {
    player.cardStates = {}
  }
  if (!player.cardStates.__pendingChoice__) {
    player.cardStates.__pendingChoice__ = { counters: {} }
  }
  if (!player.cardStates.__pendingChoice__.extraData) {
    player.cardStates.__pendingChoice__.extraData = {}
  }
  
  player.cardStates.__pendingChoice__.extraData = {
    options,
    promptKey,
    targetCardId: CARD_ID,
  }
}

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
 * Hook for triggering choice after building an oven.
 * "Each time after you build a Fireplace, Cooking Hearth, or oven, 
 * move up to 4 <WOOD> from this card to your supply."
 */
const firewoodAfterBuildListener: CardListenerRegistration = {
  id: 'C75-firewood-after-build',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['improvement-any'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { player, args } = context
    
    // Check if the built card is an oven
    const builtCardId = args?.cardId as string | undefined
    if (!builtCardId || !OVEN_IMPROVEMENTS.includes(builtCardId)) return
    
    // Check if there's wood on this card
    const woodOnCard = player.cardStates?.[CARD_ID]?.counters?.['wood'] ?? 0
    if (woodOnCard <= 0) return
    
    // Generate options and store them in the generic location
    const options = generateFirewoodOptions(woodOnCard)
    if (options.length === 0) return
    
    storePendingChoice(player, options, 'ui.interactionFirewoodExchange')
    
    return {
      flow: {
        type: 'leaf',
        actionId: 'card-choice',
      },
    }
  },
}

registerCardListener(firewoodAfterBuildListener)

/**
 * Hook for processing the choice result after card-choice action completes
 */
const firewoodProcessChoiceListener: CardListenerRegistration = {
  id: 'C75-firewood-process-choice',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['card-choice'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { player } = context
    
    // Check if this choice was for us
    const pendingChoice = player.cardStates?.__pendingChoice__?.extraData as {
      options?: ActionChoiceOption[]
      promptKey?: string
      targetCardId?: string
      choiceResult?: string
      choiceTimestamp?: number
    } | undefined
    
    if (pendingChoice?.targetCardId !== CARD_ID) return
    if (pendingChoice?.choiceResult === undefined) return
    
    const choice = pendingChoice.choiceResult
    const count = Number(choice)
    
    // Clear the pending choice data
    if (player.cardStates?.__pendingChoice__?.extraData) {
      delete player.cardStates.__pendingChoice__.extraData
    }
    
    if (Number.isFinite(count) && count > 0) {
      const woodOnCard = player.cardStates?.[CARD_ID]?.counters?.['wood'] ?? 0
      const actualCount = Math.min(count, woodOnCard, 4)
      
      if (actualCount > 0) {
        // Initialize card state if needed
        if (!player.cardStates) {
          player.cardStates = {}
        }
        if (!player.cardStates[CARD_ID]) {
          player.cardStates[CARD_ID] = { counters: {} }
        }
        if (!player.cardStates[CARD_ID].counters) {
          player.cardStates[CARD_ID].counters = {}
        }
        
        // Update wood counts
        player.cardStates[CARD_ID].counters!['wood'] = woodOnCard - actualCount
        player.resources.wood += actualCount
        
        return {
          logKey: 'log.firewoodGain',
          logParams: { count: actualCount },
        }
      }
    }
  },
}

registerCardListener(firewoodProcessChoiceListener)

export const C75_Firewood = new MinorImprovement({
  id: CARD_ID,
  name: "Firewood",
  deck: "C",
  number: 75,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["In the returning home phase of each round, place 1 <WOOD> on this card. Each time after you build a Fireplace, Cooking Hearth, or oven, move up to 4 <WOOD> from this card to your supply."],
  cost: {"food": 2},
})
