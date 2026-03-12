import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { Resource } from '../../game/types'

const CARD_ID = 'A53_Claypipe'
const BUILDING_RESOURCES: (keyof Resource)[] = ['wood', 'clay', 'reed', 'stone']
const TRACKED_ACTIONS = ['gain', 'receive', 'collect', 'exchange'] as const

const claypipeTrackListener: CardListenerRegistration = {
  id: 'A53-claypipe-track-building-resources',
  cardIds: [CARD_ID],
  phases: ['immediatelyAfter' as ActionHookPhase],
  actions: [...TRACKED_ACTIONS],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { state, player, result } = context
    if (result?.type !== 'ok' || !result.resourcesGained) return
    for (const res of BUILDING_RESOURCES) {
      const amount = result.resourcesGained[res] ?? 0
      if (amount > 0) {
        if (!state.workPhaseObtainedResources[player.id]) {
          state.workPhaseObtainedResources[player.id] = {}
        }
        const current = state.workPhaseObtainedResources[player.id][res] ?? 0
        state.workPhaseObtainedResources[player.id][res] = current + amount
      }
    }
  },
}

const claypipeAfterListener: CardListenerRegistration = {
  id: 'A53-claypipe-after',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect', 'gain'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { state, player } = context

    const workPhaseResources = state.workPhaseObtainedResources?.[player.id] ?? {}
    let totalBuilding = 0
    for (const res of BUILDING_RESOURCES) {
      totalBuilding += workPhaseResources[res] ?? 0
    }

    if (totalBuilding >= 7) {
      return {
        flow: {
          type: 'seq',
          children: [
            { type: 'leaf', actionId: 'gain-food', optional: false },
          ],
        },
      }
    }
  },
}

registerCardListener(claypipeTrackListener)
registerCardListener(claypipeAfterListener)

export const A53_Claypipe = new MinorImprovement({
  id: "A53_Claypipe",
  name: "Claypipe",
  deck: "A",
  number: 53,
  category: "FOOD_PROVIDER",
  desc: ["In the returning home phase of each round, if you gained at least 7 building resources in the preceding work phase, you get 2 <FOOD>."],
  cost: {"clay":1},
})
