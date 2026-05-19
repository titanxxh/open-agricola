import type { GameEvent, ResourceMovedEvent } from '../contract/events'
import type { ActionDetailParts } from '../contract/protocol/game'
import type { LogEntry, Resource } from '../contract/types'

export type EventLogMapperContext = {
  playerNames: Record<string, string>
  actionNames?: Record<string, string>
}

const positiveResources = (resources: Partial<Resource>): Partial<Resource> =>
  Object.fromEntries(Object.entries(resources).filter(([, value]) => typeof value === 'number' && value > 0))

const playerName = (ctx: EventLogMapperContext, playerId?: string): string | undefined =>
  playerId ? ctx.playerNames[playerId] ?? playerId : undefined

const actionName = (ctx: EventLogMapperContext, actionId?: string): string | undefined =>
  actionId ? ctx.actionNames?.[actionId] ?? actionId : undefined

const actionDetailLog = (
  ctx: EventLogMapperContext,
  playerId: string | undefined,
  actionId: string | undefined,
  detailParts: ActionDetailParts,
): LogEntry => ({
  key: 'log.actionDetail',
  params: {
    player: playerName(ctx, playerId),
    action: actionName(ctx, actionId),
    detailParts,
  },
})

const mapResourceMoved = (event: ResourceMovedEvent, ctx: EventLogMapperContext): LogEntry | null => {
  if (event.to.kind !== 'player') return null

  const gain = positiveResources(event.resources)
  if (Object.keys(gain).length === 0) return null

  if (event.reason === 'cardEffect') {
    return {
      key: 'log.cardEffectGain',
      params: {
        player: playerName(ctx, event.to.playerId),
        gain,
        ...(event.sourceCardId ? { cardId: event.sourceCardId } : {}),
      },
    }
  }

  return actionDetailLog(ctx, event.to.playerId, event.sourceActionId ?? event.reason, { gains: gain })
}

export const eventsToLogEntries = (events: readonly GameEvent[], ctx: EventLogMapperContext): LogEntry[] =>
  [...events]
    .sort((left, right) => right.seq - left.seq)
    .flatMap((event): LogEntry[] => {
      if (event.type === 'resource.moved') {
        const entry = mapResourceMoved(event, ctx)
        return entry ? [entry] : []
      }

      if (event.type === 'resource.exchanged') {
        return [
          actionDetailLog(ctx, event.actorPlayerId, event.sourceActionId ?? event.exchangeSource ?? 'exchange', {
            gains: positiveResources(event.gained),
            costs: positiveResources(event.paid),
          }),
        ]
      }

      if (event.type === 'resource.paid') {
        const cost = positiveResources(event.resources)
        if (!event.sourceCardId) {
          return [
            actionDetailLog(ctx, event.actorPlayerId, event.sourceActionId ?? event.paymentFor, {
              costs: cost,
            }),
          ]
        }

        return [
          {
            key: 'log.cardEffectPay',
            params: {
              player: playerName(ctx, event.actorPlayerId),
              cost,
              cardId: event.sourceCardId,
            },
          },
        ]
      }

      return []
    })
