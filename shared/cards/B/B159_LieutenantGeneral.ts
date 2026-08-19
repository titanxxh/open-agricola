import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B159_LieutenantGeneral'
/**
 * B159 Lieutenant General (Occupation, B, 159)
 * Each time another player plows a field adjacent to an existing field,
 * card owner gets 1 food.
 *
 * Rule: onPlayerAfterPlow — checks if the newly plowed field is adjacent
 * to an existing field. In open-agricola, when a player already has at
 * least 1 field, any newly plowed field must be adjacent (adjacency is
 * enforced by getPlowableTiles). So: after plow, if the acting player
 * now has >= 2 fields, the condition is met.
 *
 * scope 'opponent' — fires when an opponent plows.
 * Players 4+.
 */
const listener: CardListenerRegistration = {
  id: 'B159-lieutenant-general-opponent-plow',
  cardIds: [CARD_ID],
  actions: ['plow'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // After the plow action, the trigger player (opponent) has the new field.
    // If they have 2+ fields, the newly plowed field was adjacent to an existing one.
    const triggerPlayer = context.triggerPlayer ?? context.player
    if (triggerPlayer.fields.length < 2) return
    const reward = context.state.round === 14 ? { grain: 1 } : { food: 1 }
    return { flow: gainLeaf(CARD_ID, reward), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B159_LieutenantGeneral = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Lieutenant General',
    deck: 'B',
    number: 159,
    category: 'FOOD_PROVIDER',
    desc: [
        'For each <FIELD> tile that another player places next to an existing <FIELD> tile, you get 1 <FOOD> from the general supply. In round 14, you get 1 <GRAIN> instead.',
      ],
    cost: {},
    players: '4+',
  },
  impl: cardImpl,
})

export const B159_LieutenantGeneral_impl = B159_LieutenantGeneral.impl
