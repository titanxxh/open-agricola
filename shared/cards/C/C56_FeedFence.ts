import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getStableTilesBuiltThisAction } from '../helpers/action-snapshot'
import type { TradeModifier } from '../../game/types'

const CARD_ID = 'C56_FeedFence'

// C56 Feed Fence: For each new stable you build, you get 1 food — for your last one
// (the 4th), get 3 food instead of 1.
// Each time you build stables, you can build exactly 1 stable for 1 clay instead of 2 wood.
// BGA: onPlayerAfterStables (gain food based on stables built, +2 bonus for 4th stable)
//      onPlayerComputeCostsStables (addCost: clay 1, max 1, when base cost has wood 2)

const afterListener: CardListenerRegistration = {
  id: 'C56-feed-fence-after-stables',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['stables'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const built = getStableTilesBuiltThisAction(context.player)
    if (built <= 0) return
    // +2 bonus for 4th stable (when player now has exactly 4 stables)
    const bonusFood = context.player.stableTiles.length === 4 ? 2 : 0
    const totalFood = built + bonusFood
    return { flow: gainLeaf(CARD_ID, { food: totalFood }), sourceCard: CARD_ID }
  },
}

registerCardListener(afterListener)

export const C56_FeedFence = new MinorImprovement({
  id: CARD_ID,
  name: 'Feed Fence',
  deck: 'C',
  number: 56,
  category: 'FOOD_PROVIDER',
  desc: [
    'For each new stable you build, you get 1 <FOOD> —for your last one, get 3 <FOOD>. Each time you build stables, you can build exactly 1 stable for 1 <CLAY> instead of 2 <WOOD>.',
  ],
  cost: { wood: 1 },
  // Trade modifier: 1 clay substitutes for 2 wood, max 1 per stables action
  // BGA: Utils::addCost($args['costs'], [CLAY => 1, 'max' => 1], $this->id)
  modifier: {
    type: 'trade',
    cardId: CARD_ID,
    appliesTo: ['stables'],
    from: { clay: 1 },
    to: { wood: 2 },
    max: 1,
  } as TradeModifier,
})
