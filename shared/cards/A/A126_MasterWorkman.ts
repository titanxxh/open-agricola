import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { Resource } from '../../game/types'

const RESOURCE_MAP: (keyof Resource)[] = ['wood', 'clay', 'reed', 'stone']

const masterWorkmanBeforeListener: CardListenerRegistration = {
  id: 'A126-master-workman-before',
  cardIds: ['A126_MasterWorkman'],
  phases: ['before' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { state } = context
    const actionId = context.actionId
    const index = state.roundActionOrder.indexOf(actionId)
    if (index < 0) return
    const turn = index + 1

    if (turn >= 1 && turn <= 4) {
      const resource = RESOURCE_MAP[turn - 1]
      return {
        flow: {
          type: 'leaf',
          actionId: 'gain',
          params: { [resource]: 1 },
          sourceCard: 'A126_MasterWorkman',
        },
        sourceCard: 'A126_MasterWorkman',
      }
    }
  },
}

registerCardListener(masterWorkmanBeforeListener)

export const A126_MasterWorkman = new Occupation({
  id: "A126_MasterWorkman",
  name: "Master Workman",
  deck: "A",
  number: 126,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Each time before you use an action space card on round spaces 1/2/3/4, you get 1 <WOOD>/<CLAY>/<REED>/<STONE>."],
  cost: {},
  players: "1+",
  newSet: true,
})
