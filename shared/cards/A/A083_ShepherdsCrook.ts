import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { DraftGameEvent, FarmFenceBuiltEvent } from '../../contract/events'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A083_ShepherdsCrook'
const MIN_PASTURE_SIZE = 4

type QueryableFarmFenceBuiltEvent = FarmFenceBuiltEvent | DraftGameEvent<'farm.fenceBuilt'>

const isFarmFenceBuiltEvent = (
  event: CardListenerContext['transactionEvents'][number],
): event is QueryableFarmFenceBuiltEvent =>
  event.type === 'farm.fenceBuilt'

const newPasturesFromFenceEvents = (context: CardListenerContext): Array<{ tiles?: unknown[] }> => {
  const events = context.actionEvents ?? context.transactionEvents
  return (events ?? []).flatMap((event) =>
    isFarmFenceBuiltEvent(event) ? event.newPastures ?? [] : [],
  )
}

const listener: CardListenerRegistration = {
  id: 'A83-shepherds-crook-after-fencing',
  cardIds: [CARD_ID],
  phases: ['immediatelyAfter' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const newPastures = newPasturesFromFenceEvents(context)
    const newBig = newPastures.filter(
      (pasture) => (pasture.tiles?.length ?? 0) >= MIN_PASTURE_SIZE,
    ).length
    if (newBig <= 0) return
    const sheepGain = newBig * 2
    return { flow: gainLeaf(CARD_ID, { sheep: sheepGain }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A083_ShepherdsCrook = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Shepherd's Crook",
    deck: "A",
    number: 83,
    category: "LIVESTOCK_PROVIDER",
    desc: ["Each time you <FENCE> a new pasture covering at least 4 farmyard spaces, you immediately get 2 <SHEEP> on this pasture."],
    cost: {"wood":1},
  },
  impl: cardImpl,
})

export const A083_ShepherdsCrook_impl = A083_ShepherdsCrook.impl
