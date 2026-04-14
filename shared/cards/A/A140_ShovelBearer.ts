import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'A140_ShovelBearer'

// A140 Shovel Bearer: Each time you use the Clay Pit or Hollow accumulation space,
// you also get a number of FOOD equal to the amount of CLAY on the respective OTHER
// accumulation space.
const listener: CardListenerRegistration = {
  id: 'A140-shovel-bearer-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    const spaceId = context.space?.id
    if (spaceId !== 'clay-pit' && spaceId !== 'hollow-4') return
    // Get the OTHER clay space
    const otherSpaceId = spaceId === 'clay-pit' ? 'hollow-4' : 'clay-pit'
    const otherSpace = context.state.actionSpaces.find((s) => s.id === otherSpaceId)
    if (!otherSpace) return
    const clay = otherSpace.resources?.clay ?? 0
    if (clay <= 0) return
    return { flow: gainLeaf(CARD_ID, { food: clay }), sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

export const A140_ShovelBearer = new Occupation({
  id: CARD_ID,
  name: 'Shovel Bearer',
  deck: 'A',
  number: 140,
  category: 'FOOD_PROVIDER',
  desc: ['Each time you use the __Clay Pit__ or __Hollow__ accumulation space, you also get a number of <FOOD> equal to the amount of <CLAY> on the respective other accumulation space.'],
  cost: {},
  players: '3+',
  newSet: true,
})
