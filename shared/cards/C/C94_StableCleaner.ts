import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import type { CardImpl } from '../registry'
import { C94_StableCleaner } from '../../cards-display/C/C94_StableCleaner'
export { C94_StableCleaner }

const CARD_ID = C94_StableCleaner.id

/**
 * C94 Stable Cleaner — At any time, you can take the __Build Stables__ action
 * without placing a person. If you do, each stable costs you 1 <WOOD> and 1 <FOOD>.
 *
 * BGA: anytime + flagCardNode + STABLES action with costs={WOOD=>1, FOOD=>1}.
 *
 * Implementation: anytime listener emits SEQ
 *   set-flag → stables (with actionContext.costOverride { wood:-1, food:1 })
 *   → unset-flag.
 * `applyCostOverride` flips the base { wood:2 } to { wood:1, food:1 }; the
 * existing stables farm-interaction / payment paths read the override
 * naturally (no stables.ts changes needed).
 */
const anytimeListener: CardListenerRegistration = {
  id: 'C94-stable-cleaner-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (context.player.stableTiles.length >= 4) return
    if ((context.player.resources.wood ?? 0) < 1) return
    if ((context.player.resources.food ?? 0) < 1) return
    return {
      flow: {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
          {
            type: 'leaf',
            actionId: 'stables',
            sourceCard: CARD_ID,
            actionContext: { costOverride: { wood: -1, food: 1 }, trueAction: false },
          },
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: false } },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.C94_StableCleaner.anytime',
    }
  },
}

export const C94_StableCleaner_impl = {
  listeners: [anytimeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
