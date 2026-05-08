import { MinorImprovement } from '../types'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { GameState, PlayerState } from '../../contract/types'
import { initCardState } from '../__stubs__/helpers'
import type { CardImpl } from '../registry'

const OVEN_IMPROVEMENTS = new Set([
  'Major_Fireplace1',
  'Major_Fireplace2',
  'Major_CookingHearth1',
  'Major_CookingHearth2',
  'Major_ClayOven',
  'Major_StoneOven',
  'E63_IronOven',
  'E64_SimpleOven',
  'D59_EarthOven',
  'A60_OrientalFireplace',
])

const CARD_ID = 'C75_Firewood'

const getBuiltImprovementId = (choice: string | undefined) =>
  choice ? choice.replace(/^major:/, '').replace(/^minor:/, '') : undefined

const buildTakeWoodFlow = (woodOnCard: number): ActionHookResult | void => {
  const maxWood = Math.min(4, woodOnCard)
  if (maxWood <= 0) return
  return {
    flow: {
      type: 'xor',
      optional: true,
      promptKey: 'ui.interactionFirewoodExchange',
      children: Array.from({ length: maxWood }, (_, index) => ({
        type: 'leaf' as const,
        actionId: 'take-from-card',
        params: { wood: index + 1 },
        sourceCard: CARD_ID,
        choiceLabelKey: 'ui.interactionFirewoodExchangeCount',
        choiceLabelParams: { count: index + 1 },
      })),
    },
  }
}

const firewoodReturnHomeEffect = {
  id: CARD_ID,
  onReturnHome: (_state: GameState, player: PlayerState): void => {
    const counters = initCardState(player, CARD_ID)
    counters['wood'] = (counters['wood'] ?? 0) + 1
  },
}

const firewoodAfterBuildListener: CardListenerRegistration = {
  id: 'C75-firewood-after-build',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['improvement-any'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { player, choice } = context
    const builtCardId = getBuiltImprovementId(choice)
    if (!builtCardId || !OVEN_IMPROVEMENTS.has(builtCardId)) return
    const woodOnCard = player.cardStates?.[CARD_ID]?.counters?.['wood'] ?? 0
    return buildTakeWoodFlow(woodOnCard)
  },
}

export const C75_Firewood = new MinorImprovement({
  id: CARD_ID,
  name: "Firewood",
  deck: "C",
  number: 75,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["In the returning home phase of each round, place 1 <WOOD> on this card. Each time after you build a Fireplace, Cooking Hearth, or oven, move up to 4 <WOOD> from this card to your supply."],
  cost: {"food": 2},
})

export const C75_Firewood_impl = {
  listeners: [firewoodAfterBuildListener],
  effect: firewoodReturnHomeEffect,
  reaches: [] as readonly string[],
} satisfies CardImpl
