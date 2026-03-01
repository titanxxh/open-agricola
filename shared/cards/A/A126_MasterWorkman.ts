import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { Resource, ActionSpace } from '../../game/types'

const RESOURCE_MAP: (keyof Resource)[] = ['wood', 'clay', 'reed', 'stone']

const masterWorkmanBeforeListener: CardListenerRegistration = {
  id: 'A126-master-workman-before',
  cardIds: ['A126_MasterWorkman'],
  phases: ['before' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { space } = context
    const turn = (space as ActionSpace).roundAvailable
    
    if (turn >= 1 && turn <= 4) {
      const resource = RESOURCE_MAP[turn - 1]
      return { costs: { [resource]: -1 } }
    }
  },
}

const masterWorkmanComputeArgsListener: CardListenerRegistration = {
  id: 'A126-master-workman-compute-args',
  cardIds: ['A126_MasterWorkman'],
  phases: ['computeArgs' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { state } = context
    
    return {
      extraOptions: state.actionSpaces
        .filter((space: ActionSpace) => space.roundAvailable >= 1 && space.roundAvailable <= 4)
        .map((space: ActionSpace) => ({
          value: space.id,
          labelKey: space.nameKey,
          labelParams: { resources: 'ignore' },
        })),
    }
  },
}

registerCardListener(masterWorkmanBeforeListener)
registerCardListener(masterWorkmanComputeArgsListener)

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
