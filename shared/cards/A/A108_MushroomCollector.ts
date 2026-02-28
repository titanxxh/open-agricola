import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const isWoodAccumulationSpace = (space: any): boolean => {
  return (space.gainPerRound?.wood ?? 0) > 0
}

const mushroomCollectorImmediatelyAfterListener: CardListenerRegistration = {
  id: 'A108-mushroom-collector-immediately-after',
  phases: ['immediatelyAfter' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { space } = context
    
    if (!isWoodAccumulationSpace(space)) return
    
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          { type: 'leaf', actionId: 'special-effect', optional: false },
        ],
      },
    }
  },
}

registerCardListener(mushroomCollectorImmediatelyAfterListener)

export const A108_MushroomCollector = new Occupation({
  id: "A108_MushroomCollector",
  name: "Mushroom Collector",
  deck: "A",
  number: 108,
  category: "FOOD_PROVIDER",
  desc: ["Immediately after each time you use a wood accumulation space, you can exchange 1 <WOOD> for 2 <FOOD>. If you do, place the <WOOD> on the accumulation space."],
  cost: {},
  players: "1+",
})
