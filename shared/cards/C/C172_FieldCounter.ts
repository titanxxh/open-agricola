import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { DraftGameEvent, GameEvent } from '../../contract/events'
import type { CardImpl } from '../registry'
import { storedFoodCashoutListener, storeFoodOnCardFlow } from '../helpers/stored-food-cashout'

const CARD_ID = 'C172_FieldCounter'

const countPlowedFields = (
  events: readonly (GameEvent | DraftGameEvent)[],
  playerId: string,
): number =>
  events
    .filter((event): event is Extract<GameEvent | DraftGameEvent, { type: 'farm.fieldPlowed' }> =>
      event.type === 'farm.fieldPlowed',
    )
    .reduce((sum, { fields }) =>
      sum + fields.filter((field) => field.playerId === playerId).length, 0)

const afterOpponentPlowListener: CardListenerRegistration = {
  id: 'C172-field-counter-after-opponent-plow',
  cardIds: [CARD_ID],
  actions: ['plow'],
  phases: ['after' as ActionHookPhase],
  scope: 'any',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const owner = context.ownerPlayer
    if (!owner) return
    if (owner.id === context.player.id) return
    const plowed = countPlowedFields(context.actionEvents ?? context.transactionEvents, context.player.id)
    const flow = storeFoodOnCardFlow(owner, CARD_ID, plowed)
    if (!flow) return
    return { flow, sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [
    afterOpponentPlowListener,
    storedFoodCashoutListener(CARD_ID, 'C172-field-counter-cashout'),
  ],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C172_FieldCounter = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Field Counter',
    deck: 'C',
    number: 172,
    category: 'FOOD_PROVIDER',
    desc: ['Each time another player plows a <FIELD>, place 1 <FOOD> on this card. Once this game, you can turn this card face down to get the <FOOD> on it.'],
    cost: {},
    players: '5+',
  },
  presentation: { counters: ['food'] },
  impl: cardImpl,
})

export const C172_FieldCounter_impl = C172_FieldCounter.impl
