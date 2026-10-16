import { defineOccupationCard } from '../card-source'
import { type CardListenerRegistration, type CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import { stablesAction } from '../../actions/effects/stables'
import type { CardImpl } from '../registry'
import { getAvailableStableSupplyCount } from '../../domain/supply-tokens'
import { INJECTED_ANYTIME_COMPLETION_CONTEXT_KEY } from '../../engine/action-context-flags'

const CARD_ID = 'C094_StableCleaner'

const STABLES_CONTEXT = { exactCost: { wood: 1, food: 1 }, trueAction: false }

const canBuildCleanerStable = (context: CardListenerContext) => {
  return stablesAction.costPreview?.canExecute?.(
    {
      actionHooks: context.actionHooks,
      state: context.state,
      player: context.player,
      space: context.space,
      sourceCard: CARD_ID,
      actionContext: STABLES_CONTEXT,
    },
  ) ?? false
}

/**
 * C94 Stable Cleaner — At any time, you can take the __Build Stables__ action
 * without placing a person. If you do, each stable costs you 1 <WOOD> and 1 <FOOD>.
 *
 * Rule: anytime + flagCardNode + STABLES action with costs={WOOD=>1, FOOD=>1}.
 *
 */
const anytimeListener: CardListenerRegistration = {
  id: 'C94-stable-cleaner-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  preScoring: true,
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (getAvailableStableSupplyCount(context.state, context.player) <= 0) return
    if (!canBuildCleanerStable(context)) return
    return {
      flow: {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
          {
            type: 'leaf',
            actionId: 'stables',
            sourceCard: CARD_ID,
            actionContext: STABLES_CONTEXT,
          },
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'set-flag', flag: false },
            actionContext: { [INJECTED_ANYTIME_COMPLETION_CONTEXT_KEY]: true },
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [anytimeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C094_StableCleaner = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Stable Cleaner',
    deck: 'C',
    number: 94,
    category: 'ACTIONS_BOOSTER',
    desc: ['At any time, you can take the __Build Stables__ action without placing a person. If you do, each <STABLE> costs you 1 <WOOD> and 1 <FOOD>.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const C094_StableCleaner_impl = C094_StableCleaner.impl
