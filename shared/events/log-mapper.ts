import { registerHistoryParticipantRoles } from '../projections/history-record-identity'
import type {
  ActionDetailLoggedEvent,
  ActionAccumulatedEvent,
  CardDestroyedEvent,
  CardInfoboxChangedEvent,
  CardPassedEvent,
  CardPlayedEvent,
  CardResourcePairsStoredEvent,
  CardReturnedToBoardEvent,
  CardStackChangedEvent,
  CardSwappedWithBoardEvent,
  CardTriggeredEvent,
  FarmAnimalMovedEvent,
  FarmCropAddedEvent,
  FarmCropRemovedEvent,
  FarmFenceBuiltEvent,
  FarmFenceConsumedEvent,
  FutureMeepleRemovedEvent,
  FutureMeepleResolvedEvent,
  FutureMeepleQueuedEvent,
  FarmRenovatedEvent,
  FarmStableBuiltEvent,
  GameEvent,
  HarvestHeatedEvent,
  HarvestPhaseStartedEvent,
  ParentMotherScheduledEvent,
  ResourceAccumulatedEvent,
  ResourcePaidEvent,
  ResourceMovedEvent,
  WorkerPromotedEvent,
  WorkerReturnedEvent,
  WorkerPlacedEvent,
} from '../contract/events'
import type { ActionDetailParts } from '../contract/protocol/game'
import type { FutureMeepleResourceMap, LogEntry, Resource } from '../contract/types'

export type EventLogMapperContext = {
  playerNames: Record<string, string>
  actionNames?: Record<string, string>
}

export type LogPresentationEventRef = Pick<GameEvent, 'id' | 'seq' | 'type'>

export type LogPresentationConsumedEventReason =
  | 'cardPayment'
  | 'renovationPayment'
  | 'stablePayment'

export type LogPresentationSuppressedEventReason = 'futureResourceReceive'

export type LogPresentationConsumedEvent = {
  consumedEventRef: LogPresentationEventRef
  consumerEventRef: LogPresentationEventRef
  reason: LogPresentationConsumedEventReason
}

export type LogPresentationSuppressedEvent = {
  suppressedEventRef: LogPresentationEventRef
  reason: LogPresentationSuppressedEventReason
}

export type LogPresentationRowIdentity = {
  logKey: LogEntry['key']
  params: unknown
}

export type LogPresentationRow = {
  logEntry: LogEntry
  sourceEventRef: LogPresentationEventRef
  consumedEventRefs: LogPresentationEventRef[]
  identity: LogPresentationRowIdentity
}

export type LogPresentationPlan = {
  rows: LogPresentationRow[]
  consumedEvents: LogPresentationConsumedEvent[]
  suppressedEvents: LogPresentationSuppressedEvent[]
}

const eventRef = (event: GameEvent): LogPresentationEventRef => ({
  id: event.id,
  seq: event.seq,
  type: event.type,
})

const stablePresentationValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stablePresentationValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => [key, stablePresentationValue(entryValue)]),
  )
}

const logPresentationIdentityParams = (entry: LogEntry): unknown => {
  const params = entry.params ?? {}
  if (
    entry.key !== 'log.playImprovement' &&
    entry.key !== 'log.playMinorImprovement' &&
    entry.key !== 'log.playOccupation'
  ) {
    return params
  }
  const { player: _player, ...rest } = params
  return rest
}

export const logPresentationRowIdentity = (entry: LogEntry): LogPresentationRowIdentity => ({
  logKey: entry.key,
  params: stablePresentationValue(logPresentationIdentityParams(entry)),
})

export const logPresentationRowIdentityKey = (identity: LogPresentationRowIdentity): string =>
  JSON.stringify(identity)

const positiveResources = (resources: Partial<Resource>): Partial<Resource> =>
  Object.fromEntries(Object.entries(resources).filter(([, value]) => typeof value === 'number' && value > 0))

const resourceSuffix = (resources: Partial<Resource> | undefined): Partial<Resource> =>
  positiveResources(resources ?? {})

const cropsToResources = (
  crops: FarmCropAddedEvent['crops'] | FarmCropRemovedEvent['crops'],
): Partial<Resource> => {
  const resources: Partial<Resource> = {}
  crops.forEach((crop) => {
    if (crop.amount <= 0) return
    resources[crop.crop] = (resources[crop.crop] ?? 0) + crop.amount
  })
  return resources
}

const playerName = (ctx: EventLogMapperContext, playerId?: string): string | undefined =>
  playerId ? ctx.playerNames[playerId] ?? playerId : undefined

const MOOR_SPECIAL_ACTION_IDS = new Set([
  'cut-peat',
  'fell-trees',
  'slash-and-burn',
  'horse-market',
  'hiring-fair',
  'black-market',
  'illicit-work',
])

const BUILT_IN_LEAF_ACTION_NAMES: Record<string, string> = {
  pay: 'actions.pay.name',
  breed: 'actions.breed.name',
  improvement: 'actions.improvement.name',
  sow: 'actions.sow.name',
  reap: 'actions.reap.name',
  exchange: 'actions.exchange.name',
  'bake-bread': 'actions.bake-bread.name',
  'family-growth': 'actions.family-growth.name',
  occupation: 'actions.occupation.name',
  construct: 'actions.construct.name',
  fence: 'actions.fencing.name',
  plow: 'actions.plow.name',
  receive: 'actions.receive.name',
  'renovate-house': 'actions.renovate-house.name',
  stables: 'actions.stables.name',
}

const actionName = (ctx: EventLogMapperContext, actionId?: string): string | undefined =>
  actionId
    ? ctx.actionNames?.[actionId] ??
      BUILT_IN_LEAF_ACTION_NAMES[actionId] ??
      (MOOR_SPECIAL_ACTION_IDS.has(actionId) ? `moor.specialActions.${actionId}` : actionId)
    : undefined

const mapActionAccumulated = (
  event: ActionAccumulatedEvent,
  ctx: EventLogMapperContext,
): LogEntry | null => {
  const resources = positiveResources(event.resources)
  if (Object.keys(resources).length === 0) return null
  return {
    key: 'log.actionAccumulated',
    params: {
      action: actionName(ctx, event.spaceId),
      resources,
    },
  }
}

const mapResourceAccumulated = (
  event: ResourceAccumulatedEvent,
  ctx: EventLogMapperContext,
): LogEntry | null => {
  const resources = positiveResources(event.resources)
  if (Object.keys(resources).length === 0) return null

  if (event.to.kind === 'actionSpace') {
    return {
      key: 'log.resourceAccumulated',
      params: {
        target: 'actionSpace',
        action: actionName(ctx, event.to.spaceId),
        resources,
      },
    }
  }

  if (event.to.kind === 'card') {
    return {
      key: 'log.resourceAccumulated',
      playerId: event.to.playerId,
      params: {
        target: 'card',
        cardId: event.to.cardId,
        ...(event.to.playerId ? { player: playerName(ctx, event.to.playerId) } : {}),
        resources,
      },
    }
  }

  return {
    key: 'log.resourceAccumulated',
    params: {
      target: 'roundCard',
      round: event.to.round,
      resources,
    },
  }
}

const actionDetailLog = (
  ctx: EventLogMapperContext,
  playerId: string | undefined,
  actionId: string | undefined,
  detailParts: ActionDetailParts,
  extraParams: Record<string, unknown> = {},
): LogEntry => ({
  key: 'log.actionDetail',
  ...(playerId ? { playerId } : {}),
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

  if (event.reason === 'harvest' || event.reason === 'reap') {
    return {
      key: event.reason === 'reap' ? 'log.reapDetail' : 'log.harvestReapDetail',
      playerId: event.to.playerId,
      params: {
        player: playerName(ctx, event.to.playerId),
        resources: gain,
      },
    }
  }

  if (event.reason === 'cardEffect') {
    return {
      key: 'log.cardEffectGain',
      playerId: event.to.playerId,
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
      playerId: event.actorPlayerId,
      params: { player: playerName(ctx, event.actorPlayerId) },
    }
  }
  return {
    key: 'log.placeFarmer',
    playerId: event.actorPlayerId,
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

const mapHarvestHeated = (event: HarvestHeatedEvent, ctx: EventLogMapperContext): LogEntry => ({
  key: 'log.harvestHeatingDetail',
  playerId: event.playerId,
  params: {
    player: playerName(ctx, event.playerId),
    required: event.required,
    fuelUsed: event.fuelUsed,
    woodToFuel: event.woodToFuel,
    sickWorkers: event.sickWorkerIds.length,
    sickWorkerIds: event.sickWorkerIds,
  },
})

const mapFutureMeepleQueued = (
  event: FutureMeepleQueuedEvent,
  ctx: EventLogMapperContext,
): LogEntry | null => {
  const sourceSummary = event.sourceSummary
  if (!sourceSummary) return null
  return {
    key: sourceSummary.key,
    playerId: event.playerId,
    params: {
      player: playerName(ctx, event.playerId),
      ...sourceSummary.params,
    },
  }
}

const mapCardTriggered = (
  event: CardTriggeredEvent,
  ctx: EventLogMapperContext,
): LogEntry => {
  return {
    key: 'log.cardTriggered',
    params: {
      cardId: event.cardId,
      ...(event.triggerActionId ? { triggerAction: actionName(ctx, event.triggerActionId) } : {}),
      ...(event.replacement ? { replacement: true } : {}),
      ...(event.optional ? { optional: true } : {}),
      ...(event.accepted === false ? { declined: true } : {}),
    },
  }
}

const mapCardStackChanged = (event: CardStackChangedEvent): LogEntry => ({
  key: 'log.cardStackChanged',
  params: {
    cardId: event.cardId,
    resources: resourceSuffix(event.resources),
    delta: event.delta,
    reason: event.reason,
  },
})

const mapFutureMeepleResolved = (
  event: FutureMeepleResolvedEvent,
  ctx: EventLogMapperContext,
): LogEntry => ({
  key: 'log.futureMeepleResolved',
  playerId: event.playerId,
  params: {
    player: playerName(ctx, event.playerId),
    cardId: event.cardId,
    round: event.round,
    roomType: event.roomType ?? '',
    resources: resourceSuffix(event.resources),
  },
})

const futureMeepleActionResourceKeys = [
  'field',
  'stable',
  'forest',
  'moor',
] as const satisfies readonly Exclude<keyof FutureMeepleResourceMap, keyof Resource>[]

const isPureResourceFutureMeepleResolution = (
  event: FutureMeepleResolvedEvent,
): boolean => {
  if (event.roomType) return false
  const resources = Object.entries(event.resources ?? {})
    .filter(([, amount]) => typeof amount === 'number' && amount > 0)
  return resources.length > 0 &&
    resources.every(([resource]) =>
      !futureMeepleActionResourceKeys.some((actionResource) => actionResource === resource))
}

const mapCardResourcePairsStored = (
  event: CardResourcePairsStoredEvent,
  ctx: EventLogMapperContext,
): LogEntry => ({
  key: 'log.cardResourcePairsStored',
  playerId: event.targetPlayerId,
  params: {
    player: playerName(ctx, event.targetPlayerId),
    cardId: event.cardId,
    pairs: event.pairs.map(resourceSuffix),
  },
})

const mapCardInfoboxChanged = (event: CardInfoboxChangedEvent): LogEntry => ({
  key: 'log.cardInfoboxChanged',
  params: {
    cardId: event.cardId,
    text: event.text,
  },
})

const mapCardSwappedWithBoard = (
  event: CardSwappedWithBoardEvent,
  ctx: EventLogMapperContext,
): LogEntry => ({
  key: 'log.cardSwappedWithBoard',
  playerId: event.playerId,
  params: {
    player: playerName(ctx, event.playerId),
    fromCardId: event.fromPlayerCardId,
    toCardId: event.toPlayerCardId,
  },
})

const mapCardReturnedToBoard = (
  event: CardReturnedToBoardEvent,
  ctx: EventLogMapperContext,
): LogEntry => ({
  key: 'log.cardReturnedToBoard',
  playerId: event.playerId,
  params: {
    player: playerName(ctx, event.playerId),
    cardId: event.cardId,
  },
})

const mapCardDestroyed = (event: CardDestroyedEvent, ctx: EventLogMapperContext): LogEntry => ({
  key: 'log.cardDestroyed',
  playerId: event.playerId ?? event.actorPlayerId,
  params: {
    player: playerName(ctx, event.playerId ?? event.actorPlayerId),
    cardId: event.cardId,
  },
})

const mapCardPassed = (event: CardPassedEvent, ctx: EventLogMapperContext): LogEntry => ({
  key: 'log.cardPassed',
  playerRefs: { fromPlayer: event.fromPlayerId, toPlayer: event.toPlayerId },
  params: {
    fromPlayer: playerName(ctx, event.fromPlayerId),
    toPlayer: playerName(ctx, event.toPlayerId),
    cardId: event.cardId,
  },
})

const mapFarmCropAdded = (event: FarmCropAddedEvent, ctx: EventLogMapperContext): LogEntry => ({
  key: 'log.farmCropAdded',
  playerId: event.actorPlayerId ?? event.targetPlayerId,
  params: {
    player: playerName(ctx, event.actorPlayerId ?? event.targetPlayerId),
    crops: cropsToResources(event.crops),
  },
})

const mapFarmCropRemoved = (event: FarmCropRemovedEvent, ctx: EventLogMapperContext): LogEntry => ({
  key: 'log.farmCropRemoved',
  playerId: event.actorPlayerId ?? event.targetPlayerId,
  params: {
    player: playerName(ctx, event.actorPlayerId ?? event.targetPlayerId),
    crops: cropsToResources(event.crops),
  },
})

const mapFarmFenceConsumed = (
  event: FarmFenceConsumedEvent,
  ctx: EventLogMapperContext,
): LogEntry => ({
  key: 'log.farmFenceConsumed',
  playerId: event.actorPlayerId ?? event.targetPlayerId,
  params: {
    player: playerName(ctx, event.actorPlayerId ?? event.targetPlayerId),
    count: event.count,
  },
})

const mapFarmAnimalMoved = (event: FarmAnimalMovedEvent, ctx: EventLogMapperContext): LogEntry => ({
  key: 'log.farmAnimalMoved',
  playerId: event.actorPlayerId ?? event.targetPlayerId,
  params: {
    player: playerName(ctx, event.actorPlayerId ?? event.targetPlayerId),
    animals: resourceSuffix(event.animals),
  },
})

const mapFutureMeepleRemoved = (
  event: FutureMeepleRemovedEvent,
  ctx: EventLogMapperContext,
): LogEntry => ({
  key: 'log.futureMeepleRemoved',
  playerId: event.playerId,
  params: {
    player: playerName(ctx, event.playerId),
    cardId: event.cardId,
    rounds: event.rounds?.join(', ') ?? '',
  },
})

const mapWorkerReturned = (event: WorkerReturnedEvent): LogEntry => ({
  key: event.to === 'removed' ? 'log.workerRemoved' : 'log.workerReturned',
  params: {
    destination: event.to,
  },
})

const mapWorkerPromoted = (event: WorkerPromotedEvent, ctx: EventLogMapperContext): LogEntry => ({
  key: 'log.workerPromoted',
  playerId: event.playerId,
  params: {
    player: playerName(ctx, event.playerId),
  },
})

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
  direction: 'before' | 'after' = 'before',
): ResourcePaidEvent | undefined =>
  [...events]
    .filter((candidate): candidate is ResourcePaidEvent =>
      candidate.type === 'resource.paid' &&
      (direction === 'before' ? candidate.seq < event.seq : candidate.seq > event.seq) &&
      candidate.actorPlayerId === event.actorPlayerId &&
      candidate.paymentFor === paymentFor,
    )
    .sort((left, right) =>
      direction === 'before' ? right.seq - left.seq : left.seq - right.seq,
    )[0]

const stablePaymentForEvent = (
  events: readonly GameEvent[],
  event: FarmStableBuiltEvent,
): ResourcePaidEvent | undefined => {
  const nextStableBuiltSeq = [...events]
    .filter((candidate): candidate is FarmStableBuiltEvent =>
      candidate.type === 'farm.stableBuilt' &&
      candidate.seq > event.seq &&
      candidate.actorPlayerId === event.actorPlayerId,
    )
    .sort((left, right) => left.seq - right.seq)[0]?.seq ?? Number.POSITIVE_INFINITY
  return [...events]
    .filter((candidate): candidate is ResourcePaidEvent =>
      candidate.type === 'resource.paid' &&
      candidate.seq > event.seq &&
      candidate.seq < nextStableBuiltSeq &&
      candidate.actorPlayerId === event.actorPlayerId &&
      candidate.paymentFor === 'stables',
    )
    .sort((left, right) => left.seq - right.seq)[0]
}

const isNearestFollowingStablePayment = (
  events: readonly GameEvent[],
  event: ResourcePaidEvent,
): boolean =>
  event.paymentFor === 'stables' &&
  events.some((candidate): candidate is FarmStableBuiltEvent =>
    candidate.type === 'farm.stableBuilt' &&
    candidate.actorPlayerId === event.actorPlayerId &&
    stablePaymentForEvent(events, candidate)?.seq === event.seq
  )

const mapCardPlayed = (
  event: CardPlayedEvent,
  payment: ResourcePaidEvent | undefined,
  ctx: EventLogMapperContext,
): LogEntry => {
  if (event.cardType === 'occupation') {
    return {
      key: 'log.playOccupation',
      playerId: event.actorPlayerId,
      params: {
        player: playerName(ctx, event.actorPlayerId),
        occupations: event.cardId,
        costResources: positiveResources(payment?.resources ?? {}),
        ...(payment?.bonusSources?.length ? { bonusSources: payment.bonusSources } : {}),
      },
    }
  }
  return {
    key: event.cardType === 'major' ? 'log.playImprovement' : 'log.playMinorImprovement',
    playerId: event.actorPlayerId,
    params: {
      player: playerName(ctx, event.actorPlayerId),
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

const mapActionDetailLogged = (
  event: ActionDetailLoggedEvent,
  ctx: EventLogMapperContext,
): LogEntry =>
  actionDetailLog(ctx, event.playerId, event.actionId, event.detailParts)

const mapParentMotherScheduled = (
  event: ParentMotherScheduledEvent,
  ctx: EventLogMapperContext,
): LogEntry => ({
  key: 'log.parentMotherScheduled',
  playerId: event.playerId,
  params: {
    player: playerName(ctx, event.playerId),
    cardId: event.cardId,
    round: event.targetRound,
    reward: event.reward,
  },
})

const presentationRows = (
  event: GameEvent,
  entries: readonly LogEntry[],
  consumedEvents: readonly LogPresentationConsumedEvent[] = [],
): LogPresentationRow[] =>
  entries.map((logEntry) => ({
    logEntry,
    sourceEventRef: eventRef(event),
    consumedEventRefs: consumedEvents.map((consumed) => consumed.consumedEventRef),
    identity: logPresentationRowIdentity(logEntry),
  }))

export const buildLogPresentationPlan = (
  events: readonly GameEvent[],
  ctx: EventLogMapperContext,
): LogPresentationPlan => {
  const consumedPaymentSeqs = new Set<number>()
  const consumedEvents: LogPresentationConsumedEvent[] = []
  const suppressedEvents: LogPresentationSuppressedEvent[] = []
  const consumePayment = (
    consumerEvent: GameEvent,
    payment: ResourcePaidEvent,
    reason: LogPresentationConsumedEventReason,
  ): LogPresentationConsumedEvent[] => {
    if (consumedPaymentSeqs.has(payment.seq)) return []
    consumedPaymentSeqs.add(payment.seq)
    const relation = {
      consumedEventRef: eventRef(payment),
      consumerEventRef: eventRef(consumerEvent),
      reason,
    }
    consumedEvents.push(relation)
    return [relation]
  }

  const rows = [...events]
    .sort((left, right) => right.seq - left.seq)
    .flatMap((event): LogPresentationRow[] => {
      if (event.type === 'card.played') {
        const payment = cardPaymentFor(events, event)
        return presentationRows(
          event,
          [mapCardPlayed(event, payment, ctx)],
          payment ? consumePayment(event, payment, 'cardPayment') : [],
        )
      }

      if (event.type === 'card.triggered') {
        return presentationRows(event, [mapCardTriggered(event, ctx)])
      }

      if (event.type === 'card.infoboxChanged') {
        return presentationRows(event, [mapCardInfoboxChanged(event)])
      }

      if (event.type === 'card.stackChanged') {
        return presentationRows(event, [mapCardStackChanged(event)])
      }

      if (event.type === 'card.resourcePairsStored') {
        return presentationRows(event, [mapCardResourcePairsStored(event, ctx)])
      }

      if (event.type === 'card.swappedWithBoard') {
        return presentationRows(event, [mapCardSwappedWithBoard(event, ctx)])
      }

      if (event.type === 'card.returnedToBoard') {
        return presentationRows(event, [mapCardReturnedToBoard(event, ctx)])
      }

      if (event.type === 'card.destroyed') {
        return presentationRows(event, [mapCardDestroyed(event, ctx)])
      }

      if (event.type === 'card.passed') {
        return presentationRows(event, [mapCardPassed(event, ctx)])
      }

      if (event.type === 'resource.moved') {
        const entry = mapResourceMoved(events, event, ctx)
        return entry ? presentationRows(event, [entry]) : []
      }

      if (event.type === 'action.accumulated') {
        const entry = mapActionAccumulated(event, ctx)
        return entry ? presentationRows(event, [entry]) : []
      }

      if (event.type === 'resource.accumulated') {
        const entry = mapResourceAccumulated(event, ctx)
        return entry ? presentationRows(event, [entry]) : []
      }

      if (event.type === 'worker.placed') {
        const entry = mapWorkerPlaced(event, ctx)
        return entry ? presentationRows(event, [entry]) : []
      }

      if (event.type === 'worker.returned') {
        return presentationRows(event, [mapWorkerReturned(event)])
      }

      if (event.type === 'worker.promoted') {
        return presentationRows(event, [mapWorkerPromoted(event, ctx)])
      }

      if (event.type === 'turn.skipped') {
        return presentationRows(event, [{
          key: 'log.playerSkipped',
          playerId: event.playerId,
          params: { playerName: playerName(ctx, event.playerId) },
        }])
      }

      if (event.type === 'action.granted') {
        return presentationRows(event, [{
          key: 'log.cardGrantedAction',
          playerId: event.playerId ?? event.actorPlayerId ?? event.targetPlayerId,
          params: {
            player: playerName(ctx, event.playerId ?? event.actorPlayerId ?? event.targetPlayerId),
            actionId: event.actionId,
            cardId: event.cardId,
          },
        }])
      }

      if (event.type === 'startPlayer.changed') {
        return presentationRows(event, [{
          key: 'log.startPlayer',
          playerId: event.playerId,
          params: { player: playerName(ctx, event.playerId) },
        }])
      }

      if (event.type === 'round.started') {
        return presentationRows(event, [{ key: 'log.enterRound', params: { round: event.round } }])
      }

      if (event.type === 'work.started') {
        return presentationRows(event, [{ key: 'log.workStarted' }])
      }

      if (event.type === 'snakeOpening.reversed') {
        return presentationRows(event, [{ key: 'log.snakeOpeningReversed' }])
      }

      if (event.type === 'returnHome.started') {
        return presentationRows(event, [{ key: 'log.returnHomeStarted' }])
      }

      if (event.type === 'harvest.started') {
        return presentationRows(event, [{ key: 'log.harvest', params: { round: event.round } }])
      }

      if (event.type === 'harvest.phaseStarted') {
        return presentationRows(event, [mapHarvestPhaseStarted(event)])
      }

      if (event.type === 'harvest.reapSkipped') {
        return presentationRows(event, [{ key: 'log.harvestReapSkipped', playerId: event.playerId, params: { player: playerName(ctx, event.playerId) } }])
      }

      if (event.type === 'harvest.reapNothing') {
        return presentationRows(event, [{ key: 'log.harvestReapNothing', playerId: event.playerId, params: { player: playerName(ctx, event.playerId) } }])
      }

      if (event.type === 'harvest.feedConverted') {
        return presentationRows(event, [{
          key: 'log.harvestFeedConvert',
          playerId: event.playerId,
          params: {
            player: playerName(ctx, event.playerId),
            source: event.source,
            cost: event.cost,
            food: event.food,
          },
        }])
      }

      if (event.type === 'harvest.heated') {
        return presentationRows(event, [mapHarvestHeated(event, ctx)])
      }

      if (event.type === 'futureMeeple.queued') {
        const entry = mapFutureMeepleQueued(event, ctx)
        return entry ? presentationRows(event, [entry]) : []
      }

      if (event.type === 'futureMeeple.removed') {
        return presentationRows(event, [mapFutureMeepleRemoved(event, ctx)])
      }

      if (event.type === 'futureMeeple.resolved') {
        if (isPureResourceFutureMeepleResolution(event)) {
          suppressedEvents.push({
            suppressedEventRef: eventRef(event),
            reason: 'futureResourceReceive',
          })
          return []
        }
        return presentationRows(event, [mapFutureMeepleResolved(event, ctx)])
      }

      if (event.type === 'parent.motherScheduled') {
        return presentationRows(event, [mapParentMotherScheduled(event, ctx)])
      }

      if (event.type === 'game.started') {
        return presentationRows(event, [{ key: 'log.startGame' }])
      }

      if (event.type === 'game.ended') {
        return presentationRows(event, [{ key: 'log.gameOver' }])
      }

      if (event.type === 'continuation.restored') {
        const key = event.reason === 'scopeRollback'
          ? 'log.provisionalContinuationRollback'
          : event.reason === 'protectedObservationRejected'
            ? 'log.provisionalProtectedObservationRejected'
            : 'log.provisionalContinuationCommandRejected'
        return presentationRows(event, [{ key }])
      }

      if (event.type === 'farm.sown') {
        return presentationRows(event, [{
          key: 'log.sow',
          playerId: event.actorPlayerId,
          params: { player: playerName(ctx, event.actorPlayerId) },
        }])
      }

      if (event.type === 'farm.cropAdded') {
        return presentationRows(event, [mapFarmCropAdded(event, ctx)])
      }

      if (event.type === 'farm.cropRemoved') {
        return presentationRows(event, [mapFarmCropRemoved(event, ctx)])
      }

      if (event.type === 'farm.fieldPlowed') {
        return presentationRows(event, [actionDetailLog(ctx, event.actorPlayerId, event.sourceActionId ?? 'plow', {
          effects: { plow: event.fields.length },
        })])
      }

      if (event.type === 'farm.roomBuilt') {
        return presentationRows(event, [actionDetailLog(ctx, event.actorPlayerId, event.sourceActionId ?? 'construct', {
          effects: { buildRoom: event.rooms.length },
        })])
      }

      if (event.type === 'farm.renovated') {
        const payment = paymentForEvent(events, event, 'renovation')
        return presentationRows(
          event,
          [mapFarmRenovated(event, ctx, payment)],
          payment ? consumePayment(event, payment, 'renovationPayment') : [],
        )
      }

      if (event.type === 'farm.stableBuilt') {
        const payment = stablePaymentForEvent(events, event)
        return presentationRows(
          event,
          [mapStableBuilt(events, event, ctx, payment)],
          payment ? consumePayment(event, payment, 'stablePayment') : [],
        )
      }

      if (event.type === 'farm.fenceBuilt') {
        const entry = mapFenceBuilt(event, ctx)
        return entry ? presentationRows(event, [entry]) : []
      }

      if (event.type === 'farm.fenceConsumed') {
        return presentationRows(event, [mapFarmFenceConsumed(event, ctx)])
      }

      if (event.type === 'farm.animalMoved') {
        return presentationRows(event, [mapFarmAnimalMoved(event, ctx)])
      }

      if (event.type === 'farm.animalBred') {
        if (event.source !== 'harvest') return []
        return presentationRows(event, [{
          key: 'log.harvestBreedDetail',
          playerId: event.actorPlayerId,
          params: {
            player: playerName(ctx, event.actorPlayerId),
            resources: positiveResources(event.animals),
          },
        }])
      }

      if (event.type === 'farm.animalDiscarded') {
        return presentationRows(event, [{
          key: 'log.reorganizeDiscard',
          playerId: event.actorPlayerId,
          params: {
            player: playerName(ctx, event.actorPlayerId),
            resources: positiveResources(event.animals),
          },
        }])
      }

      if (event.type === 'resource.exchanged') {
        if ((event.paid.grain ?? 0) > 0 && (event.gained.food ?? 0) > 0 && event.exchangeSource) {
          return presentationRows(event, [{
            key: 'log.bakeBread',
            params: {
              count: event.paid.grain,
              food: event.gained.food,
              ...(event.sourceActionId ? { sourceActionId: event.sourceActionId } : {}),
              ...(event.sourceCardId ? { sourceCard: event.sourceCardId } : {}),
            },
          }])
        }
        return presentationRows(event, [
          actionDetailLog(ctx, event.actorPlayerId, event.sourceActionId ?? event.exchangeSource ?? 'exchange', {
            gains: positiveResources(event.gained),
            costs: positiveResources(event.paid),
          }),
        ])
      }

      if (event.type === 'resource.paid') {
        if (consumedPaymentSeqs.has(event.seq)) return []
        if (isNearestFollowingStablePayment(events, event)) return []
        const cost = positiveResources(event.resources)
        if (event.paymentFor === 'feeding' || event.paymentFor === 'begging') {
          return presentationRows(event, [{
            key: 'log.harvestFeedDetail',
            playerId: event.actorPlayerId,
            params: {
              player: playerName(ctx, event.actorPlayerId),
              resources: event.resources,
            },
          }])
        }
        if (!event.sourceCardId) {
          return presentationRows(event, [
            actionDetailLog(ctx, event.actorPlayerId, event.sourceActionId ?? event.paymentFor, {
              costs: cost,
              ...(event.bonusSources?.length ? { bonusSources: event.bonusSources } : {}),
            }, {
              ...(event.bonusChoiceIndex ? { bonusChoiceIndex: event.bonusChoiceIndex } : {}),
            }),
          ])
        }

        return presentationRows(event, [
          {
            key: 'log.cardEffectPay',
            playerId: event.actorPlayerId,
            params: {
              player: playerName(ctx, event.actorPlayerId),
              cost,
              cardId: event.sourceCardId,
            },
          },
        ])
      }

      if (event.type === 'action.revealed') {
        return presentationRows(event, [{
          key: 'log.actionRevealed',
          params: {
            action: actionName(ctx, event.actionId),
            roundSlot: event.roundSlot,
          },
        }])
      }

      if (event.type === 'action.exclusiveUseSet') {
        return presentationRows(event, [{
          key: 'log.actionExclusiveUseSet',
          playerId: event.playerId,
          params: {
            player: playerName(ctx, event.playerId),
            action: actionName(ctx, event.actionId),
            cardId: event.sourceCardId,
          },
        }])
      }

      if (event.type === 'action.exclusiveUseCleared') {
        return presentationRows(event, [{
          key: 'log.actionExclusiveUseCleared',
          playerId: event.playerId,
          params: {
            player: playerName(ctx, event.playerId),
            action: actionName(ctx, event.actionId),
            cardId: event.sourceCardId,
          },
        }])
      }

      if (event.type === 'action.detailLogged') {
        return presentationRows(event, [mapActionDetailLogged(event, ctx)])
      }

      return []
    })

  return { rows, consumedEvents, suppressedEvents }
}

export const eventsToLogEntries = (events: readonly GameEvent[], ctx: EventLogMapperContext): LogEntry[] =>
  buildLogPresentationPlan(events, ctx).rows.map(row => {
    const event = events.find(event => event.id === row.sourceEventRef.id && event.seq === row.sourceEventRef.seq)
    if (event) {
      const source = event as unknown as Record<string, unknown>
      const location = (key: string): string | undefined => (source[key] as { playerId?: string } | undefined)?.playerId
      const ids = {
        player: (source.playerId as string | undefined) ?? ((event.type === 'resource.moved' || event.type === 'resource.accumulated') ? location('to') : event.type === 'card.resourcePairsStored' ? event.targetPlayerId : event.actorPlayerId ?? event.targetPlayerId),
        playerName: (source.playerId as string | undefined) ?? event.actorPlayerId ?? event.targetPlayerId,
        fromPlayer: (source.fromPlayerId as string | undefined) ?? location('from') ?? event.actorPlayerId,
        toPlayer: (source.toPlayerId as string | undefined) ?? location('to') ?? event.targetPlayerId,
      }
      const roles: Record<string, string> = {}
      for (const [key, playerId] of Object.entries(ids)) {
        if (playerId && typeof row.logEntry.params?.[key] === 'string' && row.logEntry.params[key] === ctx.playerNames[playerId]) roles[`params.${key}`] = playerId
      }
      registerHistoryParticipantRoles(row.logEntry, roles)
    }
    return row.logEntry
  })
