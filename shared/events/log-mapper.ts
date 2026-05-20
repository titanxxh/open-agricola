import type {
  CardPlayedEvent,
  FarmFenceBuiltEvent,
  FarmRenovatedEvent,
  FarmStableBuiltEvent,
  GameEvent,
  HarvestPhaseStartedEvent,
  ResourcePaidEvent,
  ResourceMovedEvent,
  WorkerPlacedEvent,
} from '../contract/events'
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
  extraParams: Record<string, unknown> = {},
): LogEntry => ({
  key: 'log.actionDetail',
  params: {
    player: playerName(ctx, playerId),
    action: actionName(ctx, actionId),
    detailParts,
    ...extraParams,
  },
})

const containingActionId = (
  events: readonly GameEvent[],
  event: GameEvent,
  fallback: string | undefined,
): string | undefined => {
  const placed = [...events]
    .filter((candidate): candidate is WorkerPlacedEvent =>
      candidate.type === 'worker.placed' &&
      candidate.seq < event.seq &&
      candidate.actorPlayerId === event.actorPlayerId,
    )
    .sort((left, right) => right.seq - left.seq)[0]
  return placed?.sourceActionId ?? fallback
}

const relatedCardEffectCosts = (
  events: readonly GameEvent[],
  event: ResourceMovedEvent,
): Partial<Resource> => {
  if (event.reason !== 'collect' || event.to.kind !== 'player') return {}
  const targetPlayerId = event.to.playerId
  const placed = [...events]
    .filter((candidate): candidate is WorkerPlacedEvent =>
      candidate.type === 'worker.placed' &&
      candidate.seq < event.seq &&
      candidate.actorPlayerId === event.actorPlayerId,
    )
    .sort((left, right) => right.seq - left.seq)[0]
  const startSeq = placed?.seq ?? -1
  const endSeq = [...events]
    .filter((candidate): candidate is WorkerPlacedEvent =>
      candidate.type === 'worker.placed' &&
      candidate.seq > event.seq,
    )
    .sort((left, right) => left.seq - right.seq)[0]?.seq ?? Number.POSITIVE_INFINITY
  const costs: Partial<Resource> = {}
  events.forEach((candidate) => {
    if (
      candidate.type !== 'resource.moved' ||
      candidate.reason !== 'cardEffect' ||
      candidate.seq <= startSeq ||
      candidate.seq >= endSeq ||
      candidate.from.kind !== 'player' ||
      candidate.from.playerId !== targetPlayerId
    ) return
    Object.entries(positiveResources(candidate.resources)).forEach(([key, amount]) => {
      const resource = key as keyof Resource
      costs[resource] = (costs[resource] ?? 0) + (amount ?? 0)
    })
  })
  return costs
}

const mapResourceMoved = (
  events: readonly GameEvent[],
  event: ResourceMovedEvent,
  ctx: EventLogMapperContext,
): LogEntry | null => {
  if (event.to.kind !== 'player') return null

  const gain = positiveResources(event.resources)
  if (Object.keys(gain).length === 0) return null

  if (event.reason === 'harvest') {
    return {
      key: 'log.harvestReapDetail',
      params: {
        player: playerName(ctx, event.to.playerId),
        resources: gain,
      },
    }
  }

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

  const costs = relatedCardEffectCosts(events, event)
  return actionDetailLog(
    ctx,
    event.to.playerId,
    event.from.kind === 'actionSpace'
      ? containingActionId(events, event, event.from.spaceId)
      : event.sourceActionId ?? event.reason,
    {
      gains: gain,
      ...(Object.keys(costs).length ? { costs } : {}),
    },
  )
}

const mapWorkerPlaced = (event: WorkerPlacedEvent, ctx: EventLogMapperContext): LogEntry | null => {
  if (event.sourceActionId === 'family-growth') {
    return {
      key: 'log.familyGrowth',
      params: { player: playerName(ctx, event.actorPlayerId) },
    }
  }
  return {
    key: 'log.placeFarmer',
    params: {
      player: playerName(ctx, event.actorPlayerId),
      action: actionName(ctx, event.sourceActionId ?? event.spaceId),
    },
  }
}

const mapFenceBuilt = (event: FarmFenceBuiltEvent, ctx: EventLogMapperContext): LogEntry | null => {
  const fences = event.fences.filter((fence): fence is { type: string } =>
    typeof fence === 'object' && fence !== null && 'type' in fence,
  )
  const fencing = fences.filter((fence) => fence.type === 'fence').length
  const palisading = fences.filter((fence) => fence.type === 'palisade').length
  if (fencing === 0 && palisading === 0) return null
  return actionDetailLog(ctx, event.actorPlayerId, event.sourceActionId ?? 'fence', {
    effects: {
      ...(fencing > 0 ? { fencing } : {}),
      ...(palisading > 0 ? { palisading } : {}),
    },
  })
}

const mapHarvestPhaseStarted = (event: HarvestPhaseStartedEvent): LogEntry => {
  if (event.harvestPhase === 'field') return { key: 'log.harvestPhaseReap' }
  if (event.harvestPhase === 'feeding') return { key: 'log.harvestPhaseFeed' }
  return { key: 'log.harvestPhaseBreed' }
}

const cardPaymentFor = (
  events: readonly GameEvent[],
  played: CardPlayedEvent,
): ResourcePaidEvent | undefined => {
  const purposes = played.cardType === 'occupation'
    ? new Set(['occupation'])
    : new Set(['major-improvement', 'minor-improvement'])
  return [...events]
    .filter((event): event is ResourcePaidEvent =>
      event.type === 'resource.paid' &&
      event.seq < played.seq &&
      event.actorPlayerId === played.actorPlayerId &&
      purposes.has(event.paymentFor),
    )
    .sort((left, right) => right.seq - left.seq)[0]
}

const paymentForEvent = (
  events: readonly GameEvent[],
  event: GameEvent,
  paymentFor: ResourcePaidEvent['paymentFor'],
): ResourcePaidEvent | undefined =>
  [...events]
    .filter((candidate): candidate is ResourcePaidEvent =>
      candidate.type === 'resource.paid' &&
      candidate.seq < event.seq &&
      candidate.actorPlayerId === event.actorPlayerId &&
      candidate.paymentFor === paymentFor,
    )
    .sort((left, right) => right.seq - left.seq)[0]

const mapCardPlayed = (
  event: CardPlayedEvent,
  payment: ResourcePaidEvent | undefined,
): LogEntry => {
  if (event.cardType === 'occupation') {
    return {
      key: 'log.playOccupation',
      params: {
        occupations: event.cardId,
        costResources: positiveResources(payment?.resources ?? {}),
        ...(payment?.bonusSources?.length ? { bonusSources: payment.bonusSources } : {}),
      },
    }
  }
  return {
    key: event.cardType === 'major' ? 'log.playImprovement' : 'log.playMinorImprovement',
    params: {
      improvements: event.cardId,
      costResources: positiveResources(payment?.resources ?? {}),
      ...(payment?.returnedCardId ? { returnedCards: [payment.returnedCardId] } : {}),
      ...(payment?.bonusSources?.length ? { bonusSources: payment.bonusSources } : {}),
    },
  }
}

const mapFarmRenovated = (
  event: FarmRenovatedEvent,
  ctx: EventLogMapperContext,
  payment: ResourcePaidEvent | undefined,
): LogEntry =>
  actionDetailLog(ctx, event.actorPlayerId ?? event.playerId, event.sourceActionId ?? 'renovate-house', {
    costs: positiveResources(payment?.resources ?? {}),
    effects: { renovate: { from: event.from, to: event.to } },
    ...(payment?.bonusSources?.length ? { bonusSources: payment.bonusSources } : {}),
  })

const mapStableBuilt = (
  events: readonly GameEvent[],
  event: FarmStableBuiltEvent,
  ctx: EventLogMapperContext,
  payment: ResourcePaidEvent | undefined,
): LogEntry =>
  actionDetailLog(
    ctx,
    event.actorPlayerId,
    containingActionId(events, event, event.sourceActionId ?? 'stables'),
    {
      costs: positiveResources(payment?.resources ?? {}),
      effects: { buildStables: event.stables.length },
    },
  )

export const eventsToLogEntries = (events: readonly GameEvent[], ctx: EventLogMapperContext): LogEntry[] => {
  const consumedPaymentSeqs = new Set<number>()
  return [...events]
    .sort((left, right) => right.seq - left.seq)
    .flatMap((event): LogEntry[] => {
      if (event.type === 'card.played') {
        const payment = cardPaymentFor(events, event)
        if (payment) consumedPaymentSeqs.add(payment.seq)
        return [mapCardPlayed(event, payment)]
      }

      if (event.type === 'resource.moved') {
        const entry = mapResourceMoved(events, event, ctx)
        return entry ? [entry] : []
      }

      if (event.type === 'worker.placed') {
        const entry = mapWorkerPlaced(event, ctx)
        return entry ? [entry] : []
      }

      if (event.type === 'turn.skipped') {
        return [{
          key: 'log.playerSkipped',
          params: { playerName: playerName(ctx, event.playerId) },
        }]
      }

      if (event.type === 'action.granted') {
        return [{
          key: 'log.cardGrantedAction',
          params: {
            player: playerName(ctx, event.playerId ?? event.actorPlayerId ?? event.targetPlayerId),
            actionId: event.actionId,
            cardId: event.cardId,
          },
        }]
      }

      if (event.type === 'startPlayer.changed') {
        return [{
          key: 'log.startPlayer',
          params: { player: playerName(ctx, event.playerId) },
        }]
      }

      if (event.type === 'round.started') {
        return [{ key: 'log.enterRound', params: { round: event.round } }]
      }

      if (event.type === 'harvest.started') {
        return [{ key: 'log.harvest', params: { round: event.round } }]
      }

      if (event.type === 'harvest.phaseStarted') {
        return [mapHarvestPhaseStarted(event)]
      }

      if (event.type === 'harvest.reapSkipped') {
        return [{ key: 'log.harvestReapSkipped', params: { player: playerName(ctx, event.playerId) } }]
      }

      if (event.type === 'harvest.reapNothing') {
        return [{ key: 'log.harvestReapNothing', params: { player: playerName(ctx, event.playerId) } }]
      }

      if (event.type === 'harvest.feedConverted') {
        return [{
          key: 'log.harvestFeedConvert',
          params: {
            player: playerName(ctx, event.playerId),
            source: event.source,
            cost: event.cost,
            food: event.food,
          },
        }]
      }

      if (event.type === 'game.started') {
        return [{ key: 'log.startGame' }]
      }

      if (event.type === 'game.ended') {
        return [{ key: 'log.gameOver' }]
      }

      if (event.type === 'farm.sown') {
        return [{
          key: 'log.sow',
          params: { player: playerName(ctx, event.actorPlayerId) },
        }]
      }

      if (event.type === 'farm.fieldPlowed') {
        return [actionDetailLog(ctx, event.actorPlayerId, event.sourceActionId ?? 'plow', {
          effects: { plow: event.fields.length },
        })]
      }

      if (event.type === 'farm.roomBuilt') {
        return [actionDetailLog(ctx, event.actorPlayerId, event.sourceActionId ?? 'construct', {
          effects: { buildRoom: event.rooms.length },
        })]
      }

      if (event.type === 'farm.renovated') {
        const payment = paymentForEvent(events, event, 'renovation')
        if (payment) consumedPaymentSeqs.add(payment.seq)
        return [mapFarmRenovated(event, ctx, payment)]
      }

      if (event.type === 'farm.stableBuilt') {
        const payment = paymentForEvent(events, event, 'stables')
        if (payment) consumedPaymentSeqs.add(payment.seq)
        return [mapStableBuilt(events, event, ctx, payment)]
      }

      if (event.type === 'farm.fenceBuilt') {
        const entry = mapFenceBuilt(event, ctx)
        return entry ? [entry] : []
      }

      if (event.type === 'farm.animalBred') {
        if (event.source !== 'harvest') return []
        return [{
          key: 'log.harvestBreedDetail',
          params: {
            player: playerName(ctx, event.actorPlayerId),
            resources: positiveResources(event.animals),
          },
        }]
      }

      if (event.type === 'farm.animalDiscarded') {
        return [{
          key: 'log.reorganizeDiscard',
          params: {
            player: playerName(ctx, event.actorPlayerId),
            resources: positiveResources(event.animals),
          },
        }]
      }

      if (event.type === 'resource.exchanged') {
        if ((event.paid.grain ?? 0) > 0 && (event.gained.food ?? 0) > 0 && event.exchangeSource) {
          return [{
            key: 'log.bakeBread',
            params: {
              count: event.paid.grain,
              food: event.gained.food,
              ...(event.sourceActionId ? { sourceActionId: event.sourceActionId } : {}),
              ...(event.sourceCardId ? { sourceCard: event.sourceCardId } : {}),
            },
          }]
        }
        return [
          actionDetailLog(ctx, event.actorPlayerId, event.sourceActionId ?? event.exchangeSource ?? 'exchange', {
            gains: positiveResources(event.gained),
            costs: positiveResources(event.paid),
          }),
        ]
      }

      if (event.type === 'resource.paid') {
        if (consumedPaymentSeqs.has(event.seq)) return []
        const cost = positiveResources(event.resources)
        if (event.paymentFor === 'feeding' || event.paymentFor === 'begging') {
          return [{
            key: 'log.harvestFeedDetail',
            params: {
              player: playerName(ctx, event.actorPlayerId),
              resources: event.resources,
            },
          }]
        }
        if (!event.sourceCardId) {
          return [
            actionDetailLog(ctx, event.actorPlayerId, event.sourceActionId ?? event.paymentFor, {
              costs: cost,
              ...(event.bonusSources?.length ? { bonusSources: event.bonusSources } : {}),
            }, {
              ...(event.bonusChoiceIndex ? { bonusChoiceIndex: event.bonusChoiceIndex } : {}),
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

      if (event.type === 'action.revealed') {
        return [{
          key: 'log.actionRevealed',
          params: {
            action: actionName(ctx, event.actionId),
            roundSlot: event.roundSlot,
          },
        }]
      }

      if (event.type === 'action.exclusiveUseSet') {
        return [{
          key: 'log.actionExclusiveUseSet',
          params: {
            player: playerName(ctx, event.playerId),
            action: actionName(ctx, event.actionId),
            cardId: event.sourceCardId,
          },
        }]
      }

      if (event.type === 'action.exclusiveUseCleared') {
        return [{
          key: 'log.actionExclusiveUseCleared',
          params: {
            player: playerName(ctx, event.playerId),
            action: actionName(ctx, event.actionId),
            cardId: event.sourceCardId,
          },
        }]
      }

      return []
    })
}
