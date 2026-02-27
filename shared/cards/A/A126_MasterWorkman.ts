import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { Resource } from '../../game/types'

const RESOURCE_MAP: (keyof Resource)[] = ['wood', 'clay', 'reed', 'stone']

const masterWorkmanDuringListener: CardListenerRegistration = {
  id: 'A126-master-workman-during',
  phases: ['during' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { state, space } = context
    const round = state.round
    
    if (round >= 1 && round <= 4 && space.roundAvailable) {
      const resource = RESOURCE_MAP[round - 1]
      return { costs: { [resource]: -1 } }
    }
  },
}

const masterWorkmanComputeArgsListener: CardListenerRegistration = {
  id: 'A126-master-workman-compute-args',
  phases: ['computeArgs' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { state } = context
    const round = state.round
    
    if (round >= 1 && round <= 4) {
      return {
        extraOptions: state.actionSpaces
          .filter(space => space.roundAvailable >= 1 && space.roundAvailable <= 4)
          .map(space => ({
            value: space.id,
            labelKey: space.nameKey,
            labelParams: { resources: 'ignore' },
          })),
      }
    }
  },
}

registerCardListener(masterWorkmanDuringListener)
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
