import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readCardExtraData } from '../helpers/card-state'
import { readActionSnapshotToken } from '../helpers/action-snapshot'
import { sumResourceMovedToPlayer } from '../helpers/event-provenance'
import type { Resource } from '../../contract/types'
import type { DraftGameEvent, ResourceExchangedEvent } from '../../contract/events'
import type { CardImpl } from '../registry'
import { E53_BoarSpear } from '../../cards-display/E/E53_BoarSpear'

const CARD_ID = E53_BoarSpear.id

const TRACKED_ACTIONS = ['gain', 'collect', 'receive', 'exchange'] as const

const USED_TOKEN_KEY = 'E53UsedActionToken'

type QueryableResourceExchangedEvent = ResourceExchangedEvent | DraftGameEvent<'resource.exchanged'>

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
            actionContext: { tradeIds: ['E53_BoarSpear'] },
            choiceLabelKey: 'cards.E53_BoarSpear.choice',
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const E53_BoarSpear_impl = {
  listeners: [obtainListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
