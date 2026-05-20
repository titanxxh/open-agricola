import type {
  CostModifierType,
  FutureMeepleRoomType,
  FutureMeepleSourceSummary,
  GameState,
  PlayerState,
  Resource,
} from './types'

export type GameEventBase<T extends string> = {
  schemaVersion: 1
  id: string
  seq: number
  round: number
  phase: GameState['roundPhase']
  type: T
  visibility: 'public'
  actorPlayerId?: string
  targetPlayerId?: string
  sourceActionId?: string
  sourceCardId?: string
  trigger?: {
    phase?: string
    actionId?: string
    cardId?: string
  }
}

export type ResourceLocation =
  | { kind: 'supply' }
  | { kind: 'player'; playerId: string }
  | { kind: 'actionSpace'; spaceId: string }
  | { kind: 'field'; playerId: string; row: number; col: number }
  | { kind: 'card'; playerId?: string; cardId: string }
  | { kind: 'roundCard'; round: number }

export type PaymentPurpose =
  | CostModifierType
  | 'feeding'
  | 'bonus'
  | 'cardEffect'
  | 'harvest'
  | 'begging'

export type ResourceMovedEvent = GameEventBase<'resource.moved'> & {
  resources: Partial<Resource>
  from: ResourceLocation
  to: ResourceLocation
  reason: 'collect' | 'gain' | 'receive' | 'harvest' | 'breed' | 'cardEffect' | 'return' | 'discard'
}

export type ResourceExchangedEvent = GameEventBase<'resource.exchanged'> & {
  paid: Partial<Resource>
  gained: Partial<Resource>
  paidFrom: ResourceLocation
  paidTo: ResourceLocation
  gainedFrom: ResourceLocation
  gainedTo: ResourceLocation
  exchangeSource?: string
  times?: number
}

export type ResourceAccumulatedEvent = GameEventBase<'resource.accumulated'> & {
  resources: Partial<Resource>
  to:
    | { kind: 'actionSpace'; spaceId: string }
    | { kind: 'card'; playerId?: string; cardId: string }
    | { kind: 'roundCard'; round: number }
  silent?: boolean
}

export type ResourcePaidEvent = GameEventBase<'resource.paid'> & {
  resources: Partial<Resource>
  to?: ResourceLocation
  paymentFor: PaymentPurpose
  paymentSources?: Array<{ from: ResourceLocation; resources: Partial<Resource> }>
  bonusSources?: string[]
  bonusChoiceIndex?: Record<string, number>
  returnedCardId?: string
}

export type FarmSownEvent = GameEventBase<'farm.sown'> & {
  sows: Array<{
    location: ResourceLocation
    crop: 'grain' | 'vegetable' | 'wood' | 'stone'
    added: number
  }>
  placementOnly?: boolean
}

export type FarmCropAddedEvent = GameEventBase<'farm.cropAdded'> & {
  crops: Array<{
    location: ResourceLocation
    crop: 'grain' | 'vegetable' | 'wood' | 'stone'
    amount: number
  }>
  reason: 'sow' | 'cardEffect' | 'placement'
}

export type FarmCropRemovedEvent = GameEventBase<'farm.cropRemoved'> & {
  crops: Array<{
    location: ResourceLocation
    crop: 'grain' | 'vegetable' | 'wood' | 'stone'
    amount: number
  }>
  reason: 'harvest' | 'pay' | 'cardEffect' | 'discard'
}

export type FarmFieldPlowedEvent = GameEventBase<'farm.fieldPlowed'> & {
  fields: Array<{ playerId: string; row: number; col: number }>
}

export type FarmRoomBuiltEvent = GameEventBase<'farm.roomBuilt'> & {
  rooms: Array<{ playerId: string; row: number; col: number; type: PlayerState['houseType'] }>
}

export type FarmRenovatedEvent = GameEventBase<'farm.renovated'> & {
  playerId: string
  from: PlayerState['houseType']
  to: PlayerState['houseType']
  rooms: Array<{ row: number; col: number }>
}

export type FarmStableBuiltEvent = GameEventBase<'farm.stableBuilt'> & {
  stables: Array<{ playerId: string; row: number; col: number }>
}

export type FarmFenceBuiltEvent = GameEventBase<'farm.fenceBuilt'> & {
  fences: unknown[]
  newFenceEdges?: string[]
  newPastures?: Array<{ tiles?: unknown[] }>
}

export type FarmFenceConsumedEvent = GameEventBase<'farm.fenceConsumed'> & {
  count: number
  reason: 'cardEffect' | 'pay'
}

export type FarmAnimalMovedEvent = GameEventBase<'farm.animalMoved'> & {
  animals: Partial<Pick<Resource, 'sheep' | 'boar' | 'cattle'>>
  from?: ResourceLocation
  to?: ResourceLocation
}

export type FarmAnimalDiscardedEvent = GameEventBase<'farm.animalDiscarded'> & {
  animals: Partial<Pick<Resource, 'sheep' | 'boar' | 'cattle'>>
  reason: 'noRoom' | 'pay' | 'cardEffect'
}

export type FarmAnimalBredEvent = GameEventBase<'farm.animalBred'> & {
  animals: Partial<Pick<Resource, 'sheep' | 'boar' | 'cattle'>>
  source?: 'harvest' | 'cardEffect'
}

export type WorkerPlacedEvent = GameEventBase<'worker.placed'> & {
  workerId: string
  spaceId: string
  viaCardId?: string
}

export type WorkerReturnedEvent = GameEventBase<'worker.returned'> & {
  workers: Array<{ playerId: string; workerId: string }>
  to: 'home' | 'reserve' | 'supply'
}

export type WorkerPromotedEvent = GameEventBase<'worker.promoted'> & {
  playerId: string
  workerId: string
  from: 'newborn'
  to: 'adult'
}

export type ActionRevealedEvent = GameEventBase<'action.revealed'> & {
  actionId: string
  roundSlot: number
}

export type ActionAccumulatedEvent = GameEventBase<'action.accumulated'> & {
  spaceId: string
  resources: Partial<Resource>
}

export type ActionExclusiveUseSetEvent = GameEventBase<'action.exclusiveUseSet'> & {
  actionId: string
  playerId: string
  sourceCardId: string
  untilRound: number
}

export type ActionExclusiveUseClearedEvent = GameEventBase<'action.exclusiveUseCleared'> & {
  actionId: string
  playerId: string
  sourceCardId: string
}

export type ActionGrantedEvent = GameEventBase<'action.granted'> & {
  playerId: string
  actionId: string
  cardId: string
}

export type TurnSkippedEvent = GameEventBase<'turn.skipped'> & {
  playerId: string
  reason: 'cardEffect' | 'phaseRule'
}

export type StartPlayerChangedEvent = GameEventBase<'startPlayer.changed'> & {
  playerId: string
}

export type CardPlayedEvent = GameEventBase<'card.played'> & {
  cardId: string
  cardType: 'minor' | 'major' | 'occupation'
}

export type CardTriggeredEvent = GameEventBase<'card.triggered'> & {
  cardId: string
  triggerActionId?: string
  optional?: boolean
  accepted?: boolean
  replacement?: boolean
}

export type CardStateChangedEvent = GameEventBase<'card.stateChanged'> & {
  cardId: string
  key: string
  value: unknown
  targetPlayerId: string
}

export type CardInfoboxChangedEvent = GameEventBase<'card.infoboxChanged'> & {
  cardId: string
  text: string
  targetPlayerId: string
}

export type CardStackChangedEvent = GameEventBase<'card.stackChanged'> & {
  cardId: string
  targetPlayerId?: string
  resources?: Partial<Resource>
  delta?: number
  reason: 'store' | 'take' | 'discard' | 'accumulate' | 'cardEffect'
}

export type CardSwappedWithBoardEvent = GameEventBase<'card.swappedWithBoard'> & {
  playerId: string
  fromPlayerCardId: string
  toPlayerCardId: string
}

export type CardReturnedToBoardEvent = GameEventBase<'card.returnedToBoard'> & {
  playerId: string
  cardId: string
}

export type CardDestroyedEvent = GameEventBase<'card.destroyed'> & {
  playerId?: string
  cardId: string
  reason: 'played' | 'passed' | 'cardEffect'
}

export type CardPassedEvent = GameEventBase<'card.passed'> & {
  fromPlayerId: string
  toPlayerId: string
  cardId: string
}

export type FutureMeepleQueuedEvent = GameEventBase<'futureMeeple.queued'> & {
  playerId: string
  cardId: string
  entries: Array<{ round: number; resources?: Partial<Resource>; roomType?: FutureMeepleRoomType }>
  sourceSummary?: FutureMeepleSourceSummary
}

export type FutureMeepleRemovedEvent = GameEventBase<'futureMeeple.removed'> & {
  playerId: string
  cardId: string
  rounds?: number[]
}

export type FutureMeepleResolvedEvent = GameEventBase<'futureMeeple.resolved'> & {
  playerId: string
  cardId: string
  round: number
  resources?: Partial<Resource>
  roomType?: FutureMeepleRoomType
}

export type RoundStartedEvent = GameEventBase<'round.started'> & {
  round: number
}

export type WorkStartedEvent = GameEventBase<'work.started'>

export type ReturnHomeStartedEvent = GameEventBase<'returnHome.started'>

export type HarvestStartedEvent = GameEventBase<'harvest.started'>

export type HarvestPhaseStartedEvent = GameEventBase<'harvest.phaseStarted'> & {
  harvestPhase: 'field' | 'feeding' | 'breeding'
}

export type HarvestReapSkippedEvent = GameEventBase<'harvest.reapSkipped'> & {
  playerId: string
}

export type HarvestReapNothingEvent = GameEventBase<'harvest.reapNothing'> & {
  playerId: string
}

export type HarvestFeedConvertedEvent = GameEventBase<'harvest.feedConverted'> & {
  playerId: string
  source: string
  cost: Partial<Resource>
  food: Partial<Resource>
}

export type GameStartedEvent = GameEventBase<'game.started'>

export type GameEndedEvent = GameEventBase<'game.ended'>

export type GameEvent =
  | ResourceMovedEvent
  | ResourceExchangedEvent
  | ResourceAccumulatedEvent
  | ResourcePaidEvent
  | FutureMeepleQueuedEvent
  | FutureMeepleRemovedEvent
  | FutureMeepleResolvedEvent
  | FarmSownEvent
  | FarmCropAddedEvent
  | FarmCropRemovedEvent
  | FarmFieldPlowedEvent
  | FarmRoomBuiltEvent
  | FarmRenovatedEvent
  | FarmStableBuiltEvent
  | FarmFenceBuiltEvent
  | FarmFenceConsumedEvent
  | FarmAnimalMovedEvent
  | FarmAnimalDiscardedEvent
  | FarmAnimalBredEvent
  | WorkerPlacedEvent
  | WorkerReturnedEvent
  | WorkerPromotedEvent
  | ActionRevealedEvent
  | ActionAccumulatedEvent
  | ActionExclusiveUseSetEvent
  | ActionExclusiveUseClearedEvent
  | ActionGrantedEvent
  | TurnSkippedEvent
  | StartPlayerChangedEvent
  | CardPlayedEvent
  | CardTriggeredEvent
  | CardStateChangedEvent
  | CardInfoboxChangedEvent
  | CardStackChangedEvent
  | CardSwappedWithBoardEvent
  | CardReturnedToBoardEvent
  | CardDestroyedEvent
  | CardPassedEvent
  | RoundStartedEvent
  | WorkStartedEvent
  | ReturnHomeStartedEvent
  | HarvestStartedEvent
  | HarvestPhaseStartedEvent
  | HarvestReapSkippedEvent
  | HarvestReapNothingEvent
  | HarvestFeedConvertedEvent
  | GameStartedEvent
  | GameEndedEvent

export type DraftGameEvent<T extends GameEvent['type'] = GameEvent['type']> =
  Omit<Extract<GameEvent, { type: T }>, 'id' | 'seq' | 'round' | 'phase' | 'visibility' | 'schemaVersion'> & {
    visibility?: 'public'
  }

export type EventSink = {
  emit<T extends GameEvent['type']>(event: DraftGameEvent<T>): void
  emitMany(events: DraftGameEvent[]): void
}
