import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'A45_FireProtectionPond'
const listener: CardListenerRegistration = {
  id: 'A45-fire-protection-pond-after-renovation',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    queueFutureMeeples(context.state, {
      cardId: CARD_ID,
      playerId: context.player.id,
      startRound: context.state.round + 1,
      count: 6,
      resources: { food: 1 },
    })
    return {
      flow: {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
          futureMeeplesNode(),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A45_FireProtectionPond = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Fire Protection Pond',
    deck: 'A',
    number: 45,
    category: 'FOOD_PROVIDER',
    desc: ['Once you no longer live in a wooden house, place 1 <FOOD> on each of the next 6 round spaces. At the start of these rounds, you get the <FOOD>.'],
    cost: { food: 1 },
    prerequisite: 'Still in Wooden House',
  },
  impl: cardImpl,
})

export const A45_FireProtectionPond_impl = A45_FireProtectionPond.impl
