import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'

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
          { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'stables', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'unflag-card', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.C94_StableCleaner.anytime',
    }
  },
}

registerCardListener(anytimeListener)

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
