import { MinorImprovement } from '../types'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { Resource } from '../../contract/types'
import { workersAvailable } from '../../game/player'
import type { CardImpl } from '../registry'

const hasAccumulation = (space: { gainPerRound: Partial<Resource> }): boolean => {
  return Object.keys(space.gainPerRound).length > 0
}

const steamMachineListener: CardListenerRegistration = {
  id: 'C25-steam-machine-immediately-after',
  phases: ['immediatelyAfter' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { player, space, state } = context

    // Check if player has this card
    if (!player.minorPlayed.includes('C25_SteamMachine')) {
      return
    }

    if (workersAvailable(state, player) > 0) {
      return
    }

    if (!hasAccumulation(space)) {
      return
    }

    return {
      followUpActions: [{ actionId: 'bake-bread', sourceCard: 'C25_SteamMachine' }],
    }
  },
}

export const C25_SteamMachine = new MinorImprovement({
  id: "C25_SteamMachine",
  name: "Steam Machine",
  deck: "C",
  number: 25,
  category: "ACTIONS_BOOSTER",
  desc: ["Each work phase, if the last action space you use is an accumulation space, you can immediately afterward take a __Bake Bread__ action."],
  vp: 1,
  cost: {"wood":2},
})

export const C25_SteamMachine_impl = {
  listeners: [steamMachineListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
