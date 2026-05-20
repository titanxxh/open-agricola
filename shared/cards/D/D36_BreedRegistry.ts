import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readCardExtraData } from '../helpers/card-state'
import { sumResourceMovedFromActionSpace } from '../helpers/event-provenance'
import type { DraftGameEvent, ResourceExchangedEvent } from '../../contract/events'
import type { CardImpl } from '../registry'
import { D36_BreedRegistry } from '../../cards-display/D/D36_BreedRegistry'

const CARD_ID = D36_BreedRegistry.id

type QueryableResourceExchangedEvent = ResourceExchangedEvent | DraftGameEvent<'resource.exchanged'>

const isResourceExchangedEvent = (
  event: CardListenerContext['transactionEvents'][number],
): event is QueryableResourceExchangedEvent =>
  event.type === 'resource.exchanged'

const hasSheepConvertedToFood = (context: CardListenerContext): boolean =>
  (context.actionEvents ?? context.transactionEvents ?? []).some((event) =>
    isResourceExchangedEvent(event) &&
    (event.paid.sheep ?? 0) > 0 &&
    (event.gained.food ?? 0) > 0 &&
    event.paidFrom.kind === 'player' &&
    event.paidFrom.playerId === context.player.id,
  )

const afterCollectListener: CardListenerRegistration = {
  id: 'D36-breed-registry-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const events = context.actionEvents ?? context.transactionEvents
    const gained = sumResourceMovedFromActionSpace(events, 'sheep', (event) =>
      event.to.kind === 'player' && event.to.playerId === context.player.id,
    )
    if (gained <= 0) return
    const current = readCardExtraData<number>(context.player, CARD_ID, 'sheepGained') ?? 0
    const next = current + gained
    return {
      flow: {
        type: 'seq',
        children: [
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'set-extra-data', key: 'sheepGained', value: next },
          },
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'set-infobox', text: `${next} / 2` },
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const afterExchangeListener: CardListenerRegistration = {
  id: 'D36-breed-registry-after-exchange',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['exchange'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (hasSheepConvertedToFood(context)) {
      return {
        flow: {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: CARD_ID,
          params: { kind: 'set-extra-data', key: 'sheepConverted', value: true },
        },
        sourceCard: CARD_ID,
      }
    }
  },
}

export const D36_BreedRegistry_impl = {
  listeners: [afterCollectListener, afterExchangeListener],
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    const gained = readCardExtraData<number>(player, CARD_ID, 'sheepGained') ?? 0
    const converted = readCardExtraData<boolean>(player, CARD_ID, 'sheepConverted') ?? false
    if (converted) return 0
    return gained <= 2 ? 3 : 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
