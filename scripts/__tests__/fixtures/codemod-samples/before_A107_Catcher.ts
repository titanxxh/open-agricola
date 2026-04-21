import { Occupation } from '../types'
import { registerCardListener } from '../registry-ops'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getRoundPlacementOrder } from '../helpers/round-placement'

const CARD_ID = 'A107_Catcher'

const isBuildingResourceSpace = (space: CardListenerContext['space']): boolean =>
  (space.gainPerRound?.wood ?? 0) > 0 ||
  (space.gainPerRound?.clay ?? 0) > 0 ||
  (space.gainPerRound?.reed ?? 0) > 0 ||
  (space.gainPerRound?.stone ?? 0) > 0

const countBuildingResources = (space: CardListenerContext['space']): number =>
  (space.resources?.wood ?? 0) +
  (space.resources?.clay ?? 0) +
  (space.resources?.reed ?? 0) +
  (space.resources?.stone ?? 0)

// A107 Catcher: Each time you place your 1st/2nd/3rd person in a round on a building resource
// accumulation space with exactly 5/4/3 building resources, you get 1 FOOD.
// This uses before-collect phase so the space resources are still there for counting.
const listener: CardListenerRegistration = {
  id: 'A107-catcher-before-collect',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isBuildingResourceSpace(context.space)) return
    // getRoundPlacementOrder includes the current placement (after place-farmer)
    const placed = getRoundPlacementOrder(context.player).length
    const n = countBuildingResources(context.space)
    if (
      (placed === 1 && n === 5) ||
      (placed === 2 && n === 4) ||
      (placed === 3 && n === 3)
    ) {
      return { flow: gainLeaf(CARD_ID, { food: 1 }), sourceCard: CARD_ID }
    }
  },
}

registerCardListener(listener)

export const A107_Catcher = new Occupation({
  id: CARD_ID,
  name: 'Catcher',
  deck: 'A',
  number: 107,
  category: 'FOOD_PROVIDER',
  desc: ['Each time you place your 1st/2nd/3rd person in a round on a building resource accumulation space with exactly 5/4/3 building resources, you get 1 <FOOD>.'],
  cost: {},
  players: '1+',
  newSet: true,
})
