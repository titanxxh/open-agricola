import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import type { FarmSownEvent } from '../../contract/events'

const CARD_ID = 'E050_WildGreens'
const listener: CardListenerRegistration = {
  id: 'E50-wild-greens-after-sow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const cropTypes = new Set(
      (context.actionEvents ?? context.transactionEvents).flatMap((event) =>
        event.type === 'farm.sown'
          ? (event as Pick<FarmSownEvent, 'sows'>).sows.map((sow) => sow.crop)
          : [],
      ),
    )
    if (cropTypes.size === 0) return
    return { flow: gainLeaf(CARD_ID, { food: cropTypes.size }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E050_WildGreens = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Wild Greens',
    deck: 'E',
    number: 50,
    category: 'FOOD',
    desc: ['Each time you sow, you get 1 <FOOD> for every different type of good that you sow.'],
    cost: {},
  },
  impl: cardImpl,
})

export const E050_WildGreens_impl = E050_WildGreens.impl
