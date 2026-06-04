import { defineOccupationCard } from '../card-source'
import { runCardListeners, type CardListenerRegistration, type CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import { stablesAction } from '../../actions/effects/stables'
import type { ActionAvailabilityContext, Resource } from '../../contract/types'
import type { CardImpl } from '../registry'
import { getAvailableStableSupplyCount } from '../../domain/supply-tokens'

const CARD_ID = 'C94_StableCleaner'

const STABLES_CONTEXT = { exactCost: { wood: 1, food: 1 }, trueAction: false }

const collectStablesCostDelta = (context: CardListenerContext): Partial<Resource> => {
  const results = runCardListeners({
    ...context,
    actionId: 'stables',
    phase: 'computeCosts',
    actionContext: STABLES_CONTEXT,
    // Probe affordability of building one more stable (e.g. C88's 3rd/4th
    // discount), which is what this anytime action can build.
    params: { stableCount: 1 },
    sourceCard: CARD_ID,
  })
  const delta: Partial<Resource> = {}
  for (const result of results) {
    if (!result.costs) continue
    for (const [key, value] of Object.entries(result.costs)) {
      if (typeof value !== 'number') continue
      const resource = key as keyof Resource
      delta[resource] = (delta[resource] ?? 0) + value
    }
  }
  return delta
}

const canBuildCleanerStable = (context: CardListenerContext) => {
  const costDelta = collectStablesCostDelta(context)
  return stablesAction.costPreview?.canExecute?.(
    {
      state: context.state,
      player: context.player,
      space: context.space,
      actionContext: STABLES_CONTEXT,
    } as ActionAvailabilityContext & { actionContext?: Record<string, unknown> },
    Object.keys(costDelta).length > 0 ? costDelta : undefined,
  ) ?? false
}

/**
 * C94 Stable Cleaner — At any time, you can take the __Build Stables__ action
 * without placing a person. If you do, each stable costs you 1 <WOOD> and 1 <FOOD>.
 *
 * BGA: anytime + flagCardNode + STABLES action with costs={WOOD=>1, FOOD=>1}.
 *
 */
const anytimeListener: CardListenerRegistration = {
  id: 'C94-stable-cleaner-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
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
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: false } },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.C94_StableCleaner.anytime',
    }
  },
}

const cardImpl = {
  listeners: [anytimeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C94_StableCleaner = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Stable Cleaner',
    deck: 'C',
    number: 94,
    category: 'ACTIONS_BOOSTER',
    desc: ['At any time, you can take the __Build Stables__ action without placing a person. If you do, each stable costs you 1 <WOOD> and 1 <FOOD>.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const C94_StableCleaner_impl = C94_StableCleaner.impl
