import { defineMinorCard } from '../card-source'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../contract/types'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { CardImpl } from '../registry'
import { sumActionSpaceMovedToPlayer } from '../helpers/event-provenance'

const CARD_ID = 'M061_HayWagon'

const bonusActionFlow = (): ActionFlow => ({
  type: 'xor',
  optional: true,
  children: [
    { type: 'leaf', actionId: 'construct', sourceCard: CARD_ID, actionContext: { trueAction: false } },
    { type: 'leaf', actionId: 'renovate-house', sourceCard: CARD_ID, actionContext: { trueAction: false } },
  ],
})

const hasEnoughAccumulatedResource = (context: CardListenerContext) => {
  const events = context.actionEvents ?? context.transactionEvents
  const playerId = context.player.id
  return (
    sumActionSpaceMovedToPlayer(events, 'wood', playerId) >= 3 ||
    sumActionSpaceMovedToPlayer(events, 'clay', playerId) >= 3 ||
    sumActionSpaceMovedToPlayer(events, 'reed', playerId) >= 2 ||
    sumActionSpaceMovedToPlayer(events, 'stone', playerId) >= 2
  )
}

const listener: CardListenerRegistration = {
  id: 'M061-hay-wagon-after-collect',
  cardIds: [CARD_ID],
  actions: ['collect'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!hasEnoughAccumulatedResource(context)) return
    return { flow: bonusActionFlow(), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  prerequisiteCheck: (player) => (player.resources.horse ?? 0) >= 2,
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M061_HayWagon = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Hay Wagon",
    deck: "M",
    number: 61,
    category: "ACTIONS_BOOSTER",
    desc: [
        "Each time after you take at least 3 wood, 3 clay, 2 reed, or 2 stone from an accumulation space, you can take a \"Build Rooms\" or \"Renovation\" action without placing a person."
    ],
    cost: {
        "wood": 2
    },
    vp: 1,
    prerequisite: "2 Horses",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M061_HayWagon_impl = M061_HayWagon.impl
