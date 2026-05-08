import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { Resource } from '../../contract/types'
import { workersAvailable } from '../../domain/player'
import type { CardImpl } from '../registry'
import { C25_SteamMachine } from '../../cards-display/C/C25_SteamMachine'
export { C25_SteamMachine }

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

export const C25_SteamMachine_impl = {
  listeners: [steamMachineListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
