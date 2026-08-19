import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readCardExtraData } from '../helpers/card-state'
import { readActionSnapshotToken } from '../helpers/action-snapshot'
import { sumResourceMovedToPlayer } from '../helpers/event-provenance'
import type { Resource } from '../../contract/types'
import type { DraftGameEvent, ResourceExchangedEvent, ResourceMovedEvent } from '../../contract/events'
import type { CardImpl } from '../registry'

const CARD_ID = 'E053_BoarSpear'
const TRACKED_ACTIONS = ['gain', 'collect', 'receive', 'exchange'] as const

const USED_TOKEN_KEY = 'E53UsedActionToken'

type QueryableResourceExchangedEvent = ResourceExchangedEvent | DraftGameEvent<'resource.exchanged'>
type QueryableResourceMovedEvent = ResourceMovedEvent | DraftGameEvent<'resource.moved'>

const isResourceExchangedEvent = (
  event: CardListenerContext['transactionEvents'][number],
): event is QueryableResourceExchangedEvent =>
  event.type === 'resource.exchanged'

const sumResourceExchangedToPlayer = (
  context: CardListenerContext,
  resource: keyof Resource,
): number => {
  const events = context.actionEvents ?? context.transactionEvents
  return (events ?? []).reduce((total, event) => {
    if (!isResourceExchangedEvent(event)) return total
    const amount = event.gained[resource] ?? 0
    if (amount <= 0 || event.gainedTo.kind !== 'player' || event.gainedTo.playerId !== context.player.id) return total
    return total + amount
  }, 0)
}

const countObtainedBoar = (context: CardListenerContext): number => {
  const events = context.actionEvents ?? context.transactionEvents
  return sumResourceMovedToPlayer(events, 'boar', context.player.id) +
    sumResourceExchangedToPlayer(context, 'boar')
}

const isResourceMovedEvent = (
  event: CardListenerContext['transactionEvents'][number],
): event is QueryableResourceMovedEvent =>
  event.type === 'resource.moved'

const boarCounterSource = (
  event: CardListenerContext['transactionEvents'][number],
  playerId: string,
): { kind: 'cardCounter'; cardId: string; counterKey: 'held' } | null => {
  if (isResourceMovedEvent(event)) {
    if ((event.resources.boar ?? 0) <= 0 || event.to.kind !== 'player' || event.to.playerId !== playerId) return null
    const cardId = event.from.kind === 'card' ? event.from.cardId : event.sourceCardId
    return cardId ? { kind: 'cardCounter', cardId, counterKey: 'held' } : null
  }
  if (!isResourceExchangedEvent(event)) return null
  if ((event.gained.boar ?? 0) <= 0 || event.gainedTo.kind !== 'player' || event.gainedTo.playerId !== playerId) return null
  return event.exchangeSource ? { kind: 'cardCounter', cardId: event.exchangeSource, counterKey: 'held' } : null
}

const isNonCardBoarMovedToPlayer = (
  event: CardListenerContext['transactionEvents'][number],
  playerId: string,
): boolean =>
  isResourceMovedEvent(event)
    ? (event.resources.boar ?? 0) > 0 &&
      event.to.kind === 'player' &&
      event.to.playerId === playerId &&
      !event.sourceCardId &&
      event.from.kind !== 'card'
    : isResourceExchangedEvent(event) &&
      (event.gained.boar ?? 0) > 0 &&
      event.gainedTo.kind === 'player' &&
      event.gainedTo.playerId === playerId &&
      !event.exchangeSource

const animalPaymentPreference = (context: CardListenerContext) => {
  const events = context.actionEvents ?? context.transactionEvents
  if ((events ?? []).some((event) => isNonCardBoarMovedToPlayer(event, context.player.id))) {
    return { animal: 'boar' as const, avoid: [{ kind: 'cardCounter' as const, counterKey: 'held' }] }
  }
  const sources = (events ?? [])
    .map((event) => boarCounterSource(event, context.player.id))
    .filter((source): source is { kind: 'cardCounter'; cardId: string; counterKey: 'held' } => source !== null)
  if (sources.length > 0) {
    return { animal: 'boar' as const, prefer: sources }
  }
  return undefined
}

const obtainListener: CardListenerRegistration = {
  id: 'E53-boar-spear-after-obtain',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: [...TRACKED_ACTIONS],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!(TRACKED_ACTIONS as readonly string[]).includes(context.actionId)) return

    const obtainedBoar = countObtainedBoar(context)
    if (obtainedBoar <= 0) return

    if (context.state.roundPhase === 'breeding') return

    const token = readActionSnapshotToken(context.player)
    if (token === undefined) return
    const used = readCardExtraData<number>(context.player, CARD_ID, USED_TOKEN_KEY)
    if (used === token) return

    return {
      flow: {
        type: 'seq',
        children: [
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'set-extra-data', key: USED_TOKEN_KEY, value: token },
          },
          {
            type: 'leaf',
            actionId: 'exchange',
            optional: true,
            sourceCard: CARD_ID,
            actionContext: {
              tradeIds: ['E053_BoarSpear'],
              maxTradeTimesBySourceId: { [CARD_ID]: obtainedBoar },
              animalPaymentPreference: animalPaymentPreference(context),
            },
            choiceLabelKey: 'cards.E053_BoarSpear.choice',
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [obtainListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E053_BoarSpear = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Boar Spear',
    deck: 'E',
    number: 53,
    category: 'FOOD',
    desc: ['Each time you get at least 1 <PIG> outside of the breeding phase of a harvest, you can immediately turn them into 4 <FOOD> each.'],
    vp: 1,
    cost: { wood: 1, stone: 1 },
    exchanges: [
        // Sprint 6b: Aligned to the reference — listener-only. The trade is invocable only
        // via the `obtainListener` SEQ above (which dispatches `exchange` with
        // `tradeIds: ['E053_BoarSpear']`); it is intentionally NOT surfaced in the
        // anytime cookery window (`triggers: []`).
        { from: { boar: 1 }, to: { food: 4 }, sourceId: CARD_ID, triggers: [] },
      ],
  },
  impl: cardImpl,
})

export const E053_BoarSpear_impl = E053_BoarSpear.impl
