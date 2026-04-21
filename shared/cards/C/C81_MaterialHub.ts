import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getStoredResource } from '../helpers/card-storage'
import type { PlayerState } from '../../game/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C81_MaterialHub'

const THRESHOLDS: Record<string, number> = {
  wood: 5,
  clay: 4,
  reed: 3,
  stone: 3,
}

const BUILDING_RESOURCES = ['wood', 'clay', 'reed', 'stone'] as const

const findOwner = (state: import('../../game/types').GameState): PlayerState | undefined =>
  state.players?.find((p) => p.minorPlayed.includes(CARD_ID))

const collectListener: CardListenerRegistration = {
  id: 'C81-material-hub-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  scope: 'any',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const owner = findOwner(context.state)
    if (!owner) return

    const gained = context.result?.type === 'ok' ? context.result.resourcesGained : undefined
    if (!gained) return

    const takeChildren: import('../../game/types').ActionFlow[] = []

    for (const resource of BUILDING_RESOURCES) {
      const amount = gained[resource] ?? 0
      const threshold = THRESHOLDS[resource]!
      if (amount >= threshold) {
        const stored = getStoredResource(owner, CARD_ID, resource)
        if (stored > 0) {
          takeChildren.push({
            type: 'leaf',
            actionId: 'take-from-card',
            params: { [resource]: 1 },
            sourceCard: CARD_ID,
          })
        }
      }
    }

    if (takeChildren.length === 0) return

    return {
      flow: {
        type: 'seq',
        children: takeChildren,
      },
      sourceCard: CARD_ID,
      logKey: 'log.cardEffectTrigger',
      logParams: { cardId: CARD_ID },
    }
  },
}

export const C81_MaterialHub = new MinorImprovement({
  id: CARD_ID,
  name: 'Material Hub',
  deck: 'C',
  number: 81,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'Immediately place 2 of each building resource on this card. Each time any player (including you) takes at least 5 <WOOD>, 4 <CLAY>, 3 <REED>, or 3 <STONE>, you get 1 of that building resource from this card.',
  ],
  cost: { wood: 1, clay: 1 },
  prerequisite: '1 reed and 1 stone in your supply',
  newSet: true,
})

export const C81_MaterialHub_impl = {
  listeners: [collectListener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => {
    // Place 2 of each building resource on the card
    return {
      type: 'seq',
      children: BUILDING_RESOURCES.map((resource) => ({
        type: 'leaf' as const,
        actionId: 'store-on-card',
        params: { [resource]: 2 },
        sourceCard: CARD_ID,
      })),
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
