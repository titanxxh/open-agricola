import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'C94_StableCleaner'

/**
 * C94 Stable Cleaner — At any time, you can take the __Build Stables__ action
 * without placing a person. If you do, each stable costs you 1 <WOOD> and 1 <FOOD>.
 *
 * BGA: isListeningTo returns !isFlagged; uses flagCard/unflagCard around stables action.
 *
 * CONCERN: The custom cost (1 wood + 1 food per stable vs 2 wood) cannot be applied
 * via computeCosts since buildStable() uses hardcoded payResources(player, {wood:2}).
 * The anytime action grants access to stables without placing a farmer, but the cost
 * reduction (1 wood + 1 food) is not applied — normal 2 wood cost applies.
 * Full implementation would require extending stables.ts for cost parameterization.
 *
 * Players: 1+.
 */
const anytimeListener: CardListenerRegistration = {
  id: 'C94-stable-cleaner-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (context.player.stableTiles.length >= 4) return
    if ((context.player.resources.wood ?? 0) < 2) return
    return {
      flow: {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
          { type: 'leaf', actionId: 'stables', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: false } },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.C94_StableCleaner.anytime',
    }
  },
}

export const C94_StableCleaner = new Occupation({
  id: CARD_ID,
  name: 'Stable Cleaner',
  deck: 'C',
  number: 94,
  category: 'ACTIONS_BOOSTER',
  desc: ['At any time, you can take the __Build Stables__ action without placing a person. If you do, each stable costs you 1 <WOOD> and 1 <FOOD>.'],
  cost: {},
  players: '1+',
  newSet: true,
})

export const C94_StableCleaner_impl = {
  listeners: [anytimeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
