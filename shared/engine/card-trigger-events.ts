import type { ActionExecutionContext } from '../contract/types'
import type { DraftGameEvent, EventSink } from '../contract/events'
import type { EngineInternals } from './engine-internals'

const cardPlayPaymentCostTypes = new Set([
  'major-improvement',
  'minor-improvement',
  'occupation',
])

const readCostType = (context: ActionExecutionContext): unknown =>
  context.actionContext?.costType ?? context.params?.costType

const shouldSkipCardTriggered = (
  context: ActionExecutionContext,
  actionId: string,
): boolean =>
  actionId === 'apply-improvement' ||
  actionId === 'apply-occupation-play' ||
  (actionId === 'pay' && cardPlayPaymentCostTypes.has(String(readCostType(context))))

export const emitCardTriggered = (
  int: EngineInternals,
  eventSink: EventSink,
  context: ActionExecutionContext,
  actionId: string,
  options: { replacement?: boolean } = {},
): void => {
  const sourceCard = context.sourceCard
  if (!sourceCard || shouldSkipCardTriggered(context, actionId)) return
  const alreadyTriggered = int.events.currentTransactionEvents().some((event) =>
    event.type === 'card.triggered' && event.sourceCardId === sourceCard
  )
  if (alreadyTriggered) return
  eventSink.emit<'card.triggered'>({
    type: 'card.triggered',
    cardId: sourceCard,
    sourceCardId: sourceCard,
    triggerActionId: actionId,
    accepted: true,
    ...(options.replacement ? { replacement: true } : {}),
  })
}

export const createBufferedEventSink = () => {
  const drafts: DraftGameEvent[] = []
  const sink: EventSink = {
    emit: (event) => {
      drafts.push(event)
    },
    emitMany: (events) => {
      events.forEach((event) => sink.emit(event))
    },
  }
  return {
    sink,
    flushTo: (target: EventSink) => target.emitMany(drafts),
  }
}
