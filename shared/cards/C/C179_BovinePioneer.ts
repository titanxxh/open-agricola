import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C179_BovinePioneer'
const hasNewPasture = (context: CardListenerContext): boolean =>
  (context.actionEvents ?? context.transactionEvents).some((event) =>
    event.type === 'farm.fenceBuilt' &&
    'newPastures' in event &&
    (event.newPastures?.length ?? 0) > 0,
  )

const listener: CardListenerRegistration = {
  id: 'C179-bovine-pioneer-after-fence',
  cardIds: [CARD_ID],
  actions: ['fence'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!hasNewPasture(context)) return
    return { flow: gainLeaf(CARD_ID, { cattle: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C179_BovinePioneer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Bovine Pioneer',
    deck: 'C',
    number: 179,
    category: 'LIVESTOCK_PROVIDER',
    desc: ['Each time you create at least one new pasture from unfenced farmyard spaces you get 1 <CATTLE>.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const C179_BovinePioneer_impl = C179_BovinePioneer.impl
