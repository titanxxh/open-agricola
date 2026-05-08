import { MinorImprovement } from '../types'

const CARD_ID = 'B22_WalkingBoots'

/**
 * B22 Walking Boots — Minor Improvement
 *
 * BGA `B22_WalkingBoots::onBuy` returns NODE_SEQ children:
 *   1. gainNode([FOOD => 2])
 *   2. PLACE_FARMER args { fromSupply: true, source, markForRemoval: true }
 *
 * The placed farmer is "marked for removal": at the start of the next
 * returning-home phase, BGA removes it from play (deactivates) and returns
 * it to the supply. Our previous implementation truncated to gainLeaf food:2
 * only and tagged the card `passing: true` to mask the missing behavior.
 *
 * Implementation:
 *   - onBuy emits SEQ(gain food:2, place-farmer fromSupply markForRemoval).
 *     The `place-farmer` leaf carries `actionContext.fromSupply` (already
 *     supported by `placeFarmerAction.execute`) and `markForRemoval` (handled
 *     by `placeFarmerAction.resolveChoice`, which writes the chosen spaceId
 *     to `cardStates[B22].extraData.markedSpaceId`).
 *   - onReturnHome reads markedSpaceId, finds the worker on that space,
 *     deactivates it, removes it from the action space's takenBy, and
 *     clears the flag so the effect is one-shot per buy.
 */

export const B22_WalkingBoots = new MinorImprovement({
  id: CARD_ID,
  name: 'Walking Boots',
  deck: 'B',
  number: 22,
  category: 'ACTIONS_BOOSTER',
  desc: ['You immediately get 2 <FOOD>. You must immediately place a person from your supply. If you do, in the next returning home phase, you must remove that person from play.'],
  cost: {},
  prerequisite: 'At Most 4 People',
})
