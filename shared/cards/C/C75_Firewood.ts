import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const OVEN_IMPROVEMENTS = [
  'Major_Fireplace1',
  'Major_Fireplace2', 
  'Major_CookingHearth1',
  'Major_CookingHearth2',
  'Major_ClayOven',
  'Major_StoneOven',
  'E63_IronOven',
  'E64_SimpleOven',
  'D59_EarthOven',
]

const firewoodReturnHomeListener: CardListenerRegistration = {
  id: 'C75-firewood-return-home',
  cardIds: ['C75_Firewood'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    return {
      flow: {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'special-effect', optional: true },
        ],
      },
    }
  },
}

registerCardListener(firewoodReturnHomeListener)

export const C75_Firewood = new MinorImprovement({
  id: "C75_Firewood",
  name: "Firewood",
  deck: "C",
  number: 75,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["In the returning home phase of each round, place 1 <WOOD> on this card. Each time after you build a Fireplace, Cooking Hearth, or oven, move up to 4 <WOOD> from this card to your supply."],
  cost: {"food":2},
})
