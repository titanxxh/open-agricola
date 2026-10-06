import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getStoredResource } from '../helpers/card-storage'
import { sumResourceMovedToPlayer } from '../helpers/event-provenance'
import type { PlayerState } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C081_MaterialHub'
const THRESHOLDS: Record<string, number> = {
  wood: 5,
  clay: 4,
  reed: 3,
  stone: 3,
}

const BUILDING_RESOURCES = ['wood', 'clay', 'reed', 'stone'] as const

const findOwner = (state: import('../../contract/types').GameState): PlayerState | undefined =>
  state.players?.find((p) => p.minorPlayed.includes(CARD_ID))

const actionSpaceResourceMovedToTriggerPlayer = (
  context: CardListenerContext,
  resource: (typeof BUILDING_RESOURCES)[number],
) =>
  sumResourceMovedToPlayer(
    context.actionEvents ?? context.transactionEvents,
    resource,
    (context.triggerPlayer ?? context.player).id,
    (event) => event.from.kind === 'actionSpace',
  )

const collectListener: CardListenerRegistration = {
  id: 'C81-material-hub-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  scope: 'any',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const owner = context.ownerPlayer ?? findOwner(context.state)
    if (!owner) return

    const takeChildren: import('../../contract/types').ActionFlow[] = []

    for (const resource of BUILDING_RESOURCES) {
      const amount = actionSpaceResourceMovedToTriggerPlayer(context, resource)
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
    }
  },
}

const cardImpl = {
  prerequisiteCheck: (player) =>
    (player.resources.reed ?? 0) >= 1 && (player.resources.stone ?? 0) >= 1,
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

export const C081_MaterialHub = defineMinorCard({
  meta: {
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
  },
  presentation: { counters: ['wood', 'clay', 'reed', 'stone'] },
  impl: cardImpl,
})

export const C081_MaterialHub_impl = C081_MaterialHub.impl
