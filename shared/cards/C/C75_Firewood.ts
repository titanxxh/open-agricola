import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { GameState, PlayerState } from '../../contract/types'
import { initCardState } from '../__stubs__/helpers'
import type { CardImpl } from '../registry'
import { C75_Firewood } from '../../cards-display/C/C75_Firewood'
import { getCardDefinitionById } from '../helpers/card-type'

const CARD_ID = C75_Firewood.id

const getBuiltImprovementId = (choice: string | undefined) =>
  choice ? choice.replace(/^major:/, '').replace(/^minor:/, '') : undefined

const isFirewoodTrigger = (cardId: string): boolean => {
  const def = getCardDefinitionById(cardId)
  return def?.fireplaceIdentity === true
    || def?.cookingHearthIdentity === true
    || def?.ovenIdentity === true
}

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
  actions: ['improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { player, choice } = context
    const builtCardId = getBuiltImprovementId(choice)
    if (!builtCardId || !isFirewoodTrigger(builtCardId)) return
    const woodOnCard = player.cardStates?.[CARD_ID]?.counters?.['wood'] ?? 0
    return buildTakeWoodFlow(woodOnCard)
  },
}

export const C75_Firewood_impl = {
  listeners: [firewoodAfterBuildListener],
  effect: firewoodReturnHomeEffect,
  reaches: [] as readonly string[],
} satisfies CardImpl
