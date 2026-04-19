import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getPlayerBakeRates } from '../helpers/exchange-registry'

const CARD_ID = 'E67_GrainBag'

// Each time you use Grain Seeds, get 1 additional grain per bake-improvement you have.
const listener: CardListenerRegistration = {
  id: 'E67-grain-bag-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'grain-seeds') return
    const bakeRates = getPlayerBakeRates(context.player)
    const bakeCount = bakeRates.length
    if (bakeCount <= 0) return
    return { flow: gainLeaf(CARD_ID, { grain: bakeCount }), sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

export const E67_GrainBag = new MinorImprovement({
  id: CARD_ID,
  name: 'Grain Bag',
  deck: 'E',
  number: 67,
  category: 'CROPS_PROVIDER',
  desc: ['Each time you use the __Grain Seeds__ action space, you get 1 additional <GRAIN> for each <BAKE>-improvement you have.'],
  cost: { reed: 1 },
  vp: 1,
})
