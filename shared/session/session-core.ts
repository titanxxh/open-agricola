import type {
  DraftGameEvent,
  EventSink,
  GameEvent,
} from '../contract/events.ts'
import type {
  ActionChoiceOption,
  ActionExecutionContext,
  ActionFlow,
  ActionSpace,
  ActionExecutionResult,
  AnytimeAction,
  FarmTilePosition,
  FeedQueueEntry,
  GameState,
  InteractionCommand,
  InteractionFarmSelection,
  InteractionRequest,
  InteractionSelection,
  InteractionState,
  ParentSelectionSubmission,
  PlayerState,
  ProtectedObservation,
  Resource,
  ResourceKey,
  InteractionAnimalReorgZone,
  ExactCost,
} from '../contract/types.ts'
import type { ActionDetailParts, PublicEventCancellation } from '../contract/protocol/game.ts'
import type { PrivateGameEvent } from '../contract/private-events.ts'
import { actionDefinitions, getActionDefinition } from '../actions/index.ts'
import { internalActionDefinitions } from '../actions/internal-actions.ts'
import { seasonActionDefinitions } from '../seasons/action-spaces.ts'
import { registerThroughTheSeasonsCardListeners } from '../seasons/card-listeners.ts'
import { registerThroughTheSeasonsHooks } from '../seasons/hooks.ts'
import {
  advanceThroughTheSeasons,
  applySeasonPreparationAdjustments,
} from '../seasons/state.ts'
import { getAllAdHocActions } from '../actions/helpers/ad-hoc-action-registry.ts'
import { validateSelectionEffect } from '../actions/helpers/selection-effect-registry.ts'
import {
  applyIsDoableHooksDetailed,
  clearActionHooks,
} from '../actions/hooks.ts'
import { finalizeDraft } from '../draft/draft-manager.ts'
import type { DraftPickPayload } from '../draft/types.ts'
import {
  ActionRegistry,
  EngineStack,
  INTERACTION_ONLY_ACTION_ID,
  Engine,
  HookDispatcher,
  LogStore,
  isSyntheticInteractionFrame,
  type MandatoryContinuationProbe,
} from '../engine/index.ts'
import { isInjectedAnytimeResult, tagInjectedAnytimeFlow } from '../engine/action-context-flags.ts'
import type { EngineFrame, EngineSource, EngineStackCursor, SubFlowReason } from '../engine/index.ts'
import { isProtectedActionCancel } from '../engine/protected-action-cancel.ts'
import type { PendingCursor, PendingEnvelope } from '../engine/types.ts'
import type { ReorganizeTrigger } from '../actions/effects/reorganize.ts'
import {
  createInitialState,
  createRoundOpenById,
  cloneState,
  emptyResources,
  extendedResourceKeyList,
  harvestRounds,
  type InitialStateOptions,
  normalizeState,
  resourceKeyList,
  applyRoundGrowth,
  applyFutureMeeples,
} from './state-bootstrap.ts'
import { clearWorkPhaseBuildingResources } from '../session/work-phase-resources.ts'
import {
  addFoodFromConversion,
  incFirstPlayer,
  incHarvestedGrain,
  incHarvestedVegetable,
  incResourceConverted,
} from '../session/stats.ts'
import { getMinorImprovement } from '../cards/registry-display.ts'
import { endTurnScope } from '../cards/helpers/action-snapshot.ts'
import {
  registerCustomCard,
  getCustomMinorImprovementIds,
  getCustomOccupationIds,
} from '../cards/custom-registry.ts'
import { type CustomCardData, SessionCardContext, withSessionContext } from '../cards/session-card-context.ts'
import { CardRegistry, type CardImpl } from '../cards/registry.ts'
import { getActiveCardRegistry, setActiveCardRegistry, withActiveRegistry } from '../cards/active-registry.ts'
import { ensureCatalogLookupsInstalled } from '../cards/install-catalog-lookups.ts'
import { ALL_CARD_IMPLS } from '../cards/register-all.ts'
import { allOccupationCards, allMinorImprovementCards } from '../cards/catalog.ts'
import { majorCardDefinitions } from '../cards/major/index.ts'
import { resolveDevCardIdInput } from '../cards/dev-card-id.ts'
import * as setupPhase from './phases/setup.ts'
import * as roundPhase from './phases/round.ts'
import * as harvestPhase from './phases/harvest.ts'
import * as draftPhase from './phases/draft.ts'
import { getCardModifiers } from '../cards/card-modifiers.ts'
import { getCardEffect, getHarvestBreedOrderPriority } from '../cards/card-effects.ts'
import { runCardEffectHook } from '../cards/card-effects.ts'
import { StageDispatch, type StageResumeState } from './stage-dispatch.ts'
import {
  deriveInteractionState,
  type PendingInteractionProjectionInput,
} from './interaction-state-adapter.ts'
import { positionKey } from '../domain/farm.ts'
import { getMatchingListeners, executeCardListener, listenerOwnerOptions, runCardListeners } from '../cards/card-listeners.ts'
import { buildPhaseTrailingNodes } from '../engine/engine-utils.ts'
import { createTriggerSnapshot } from '../cards/helpers/trigger-snapshot.ts'
import { Scoring, playerBoard, type PlayerScoreSummary } from '../domain'
import { reap } from '../actions/effects/reap.ts'
import { breedLeaf } from '../actions/effects/breed'
import { computeHarvestFeedingRequirement } from '../actions/helpers/harvest-feeding-requirement.ts'
import { executeImmediateSpecialEffectFlows } from '../actions/effects/internal/immediate-special-effect-flow.ts'
import { releaseWorkerFromCard } from '../cards/helpers/card-held-workers.ts'
import {
  activatePendingHarvestSkips,
  isPlayerSkippingCurrentHarvest,
} from '../cards/helpers/harvest-skip.ts'
import { resetRoundPlacements } from '../cards/helpers/round-placement.ts'
import { familySize, findPlayerById, findPlayerIndexById, hasPlayer, smallestAvailableWorker } from '../domain/player.ts'
import { animalKeysForState, type AnimalKey } from '../contract/animals.ts'
import { applyAnimalPayment, isAnimalResourceKey } from '../domain/animal-payment.ts'
import { getAllowedAnimalTypesForZone, readAnimalCountsForZoneAssignment } from '../domain/animal-zones.ts'
import { getRegisteredMinorImprovement, getRegisteredOccupation } from '../cards/registry-display'
import {
  canAffordTrade,
  getExchangesInWindow,
  getRemainingHarvestExchangeUses,
  recordHarvestExchangeUses,
} from '../actions/effects/exchange.ts'
import { getMajorCard } from '../cards/major/index.ts'
import {
  getAvailableMajorImprovementIds,
  returnMajorImprovementToSupply,
  takeMajorImprovementFromSupply,
} from '../cards/major/supply.ts'
import {
  BASIC_CONVERSION_SOURCE_ID,
  getBasicConversionExchange,
} from '../cards/basic-conversion.ts'
import { appendImmediateEvents, type ImmediateEventDraft } from '../events/append.ts'
import { EventStore } from '../events/store.ts'
import { prependDerivedLogEntries } from '../events/log-cache.ts'
import {
  appendPublicEventCanceledPacket,
  assertPublicEventArchiveCanAppend,
  PublicEventArchivePayloadError,
} from '../events/archive.ts'
import { PaymentSolver } from '../actions/payment'
import {
  isMajorImprovementPlayable,
  isMinorImprovementPlayable,
} from '../actions/effects/improvement.ts'
import { isBlockedByMajorImprovementActionGate } from '../actions/helpers/improvement-helpers'
import { getPlayerActionSpaceConfig } from '../cards/player-action-space.ts'
import {
  getOccupationActionCost,
  isOccupationPlayable,
} from '../actions/effects/occupation.ts'
import {
  getFenceCount,
  getPalisadeCount,
} from '../actions/effects/fencing.ts'
import { rebuildActiveModifiers } from '../session/serialization.ts'
import { clearAllLinkedSpaceBlocks, findActionSpaceById, removeWorkerRef } from '../domain/space.ts'
import { buildPlaceTerrainFlow } from '../moor/terrain-flow.ts'
import {
  computeAnytimePolicy,
  type AnytimePolicy,
  type AnytimePolicyInput,
} from './anytime-policy'
import {
  ensureParentMotherScheduleLogs,
  startParentSelectionIfNeeded,
  submitParentSelection as commitParentSelection,
} from '../parents/selection'
import { hasPendingOrdinaryCardDrawChoice, resolveOrdinaryCardDrawChoice } from './ordinary-card-draw'
import { canProjectActionEntry, computeActionEntryAvailability } from './action-entry-query'
import {
  planCommitSelectionSubmission,
  planResolveChoiceSubmission,
  validateFarmPositionCommit,
  validateOccupationHandCommit,
  validateResourceBatchExchangeCommit,
  validateResourceQuantityCommit,
  type FeedSelections,
  type SelectionCommitPayload,
} from './pending-command-resolution'
import {
  createMoorSpecialActionSpace,
  isMoorSpecialActionId,
  resetMoorSpecialActionCards,
  type MoorSpecialActionPayload,
} from '../moor/special-actions'
import type { MoorSpecialActionId } from '../moor/types'
import {
  applyHeatingPayment,
  computeHeatingRequirement,
  recoverInfirmaryWorkers,
  type HeatingPaymentPayload,
} from '../moor/heating'

export type { FeedSelection, FeedSelections } from './pending-command-resolution'

/**
 * Synthetic action-space ID prefix for sub-flow frames pushed onto the
 * engine stack (e.g. reorganize, future feed/confirm sub-flows). Centralised
 * here so `getSpaceById` can recognise sub-flow IDs without matching every
 * leading underscore.
 */
const SUBFLOW_SPACE_PREFIX = '__subflow:' as const

const subflowSpaceId = (reason: SubFlowReason): string =>
  `${SUBFLOW_SPACE_PREFIX}${reason}`

type PendingContextSnapshot = {
  params?: Record<string, unknown>
  costs?: Partial<Resource>
  costAttribution?: ActionExecutionContext['costAttribution']
  sourceCard?: string
  actionContext?: Record<string, unknown>
}

const pendingContextSnapshot = (
  cursor: PendingCursor | null,
): PendingContextSnapshot | null => {
  const snapshot = cursor?.contextSnapshot
  return snapshot && typeof snapshot === 'object'
    ? snapshot as PendingContextSnapshot
    : null
}

const choicesSourceCard = (choices: ActionChoiceOption[]): string | undefined => {
  const sourceCards = choices
    .map((choice) => choice.sourceCard)
    .filter((sourceCard): sourceCard is string => typeof sourceCard === 'string' && sourceCard.length > 0)
  const unique = [...new Set(sourceCards)]
  return unique.length === 1 && sourceCards.length === choices.length ? unique[0] : undefined
}

type ActionDetailResourceDelta = {
  playerId?: string
  gains?: Partial<Resource>
  costs?: Partial<Resource>
}

const captureEventSink = (events: DraftGameEvent[]): EventSink => ({
  emit: (event) => {
    events.push(event)
  },
  emitMany: (nextEvents) => {
    events.push(...nextEvents)
  },
})

const actionDetailResourceDeltas = (
  result: ActionExecutionResult,
): ActionDetailResourceDelta[] => {
  const raw = 'extraData' in result ? result.extraData?.actionDetailDeltas : undefined
  if (!Array.isArray(raw)) return []
  return raw.filter((entry): entry is ActionDetailResourceDelta =>
    typeof entry === 'object' && entry !== null,
  )
}

const positiveResourceDetail = (resources: Partial<Resource>): Partial<Resource> => {
  const detail: Partial<Resource> = {}
  for (const key of resourceKeyList) {
    const amount = resources[key] ?? 0
    if (amount > 0) detail[key] = amount
  }
  return detail
}

const compactActionDetailParts = (
  detailParts: ActionDetailParts & {
    gains: Resource
    costs: Resource
    effects: NonNullable<ActionDetailParts['effects']>
  },
): ActionDetailParts => {
  const gains = positiveResourceDetail(detailParts.gains)
  const costs = positiveResourceDetail(detailParts.costs)
  const effects = Object.keys(detailParts.effects).length > 0 ? detailParts.effects : undefined
  return {
    ...(Object.keys(gains).length ? { gains } : {}),
    ...(Object.keys(costs).length ? { costs } : {}),
    ...(effects ? { effects } : {}),
    ...(detailParts.bonusSources?.length ? { bonusSources: detailParts.bonusSources } : {}),
  }
}

type FutureMeepleActionKey = 'field' | 'stable' | 'forest' | 'moor'

const futureMeepleActionCount = (
  entry: GameState['futureMeeples'][number],
  key: FutureMeepleActionKey,
): number => Math.max(0, Math.floor(entry.resources?.[key] ?? 0))

export type HistoryEntry = {
  state: GameState
  /**
   * Pending-shape discriminator at the moment of the snapshot. Only the
   * 'choice' bit is read (by `undoStep()`'s `canRestorePriorChoice`
   * branch); we don't need the full `PendingAction` value, so keep it
   * compact instead of cloning the deprecated union.
   */
  hadChoicePending: boolean
  activeSpaceId: string | null
  activePlayerIndex: number | null
  engineSnapshot: ReturnType<Engine['snapshot']> | null
  engineSource: EngineSource | null
  stageResume: StageResumeState | null
  deferredPlayerSwitch: EngineFrame['deferredPlayerSwitch']
  turnOwnerPlayerIndex: number | null
  actionStart: boolean
  undoBoundary?: boolean
}

export type SessionCommandCheckpoint = {
  state: GameState
  engineStackCursor: EngineStackCursor
  history: HistoryEntry[]
  actionStartIndex: number | null
  actionStartPlayerSnapshot: PlayerState | null
  actionResultDetailsSinceFlush: { gains: Partial<Resource>; costs: Partial<Resource> }
  responsePrivateEvents: PrivateGameEvent[]
  deferPrivateEventDrainDepth: number
  nextActionToken: number
  turnOwnerPlayerIndex: number | null
  engineLog: ReturnType<LogStore['all']>
  cardWarningCount: number
}

export type NormalizedAuthoritativeCommand = {
  type: string
  key: string
}

export type FailedAuthoritativeCommand = {
  commandKey: string
  interactionKey: string
  ruleStateKey: string
  bindingFrameId?: string
}

export type ProvisionalContinuationScope = {
  id: string
  frameId: string
  hostNodeId: string
  parentScopeId?: string
  checkpoint: SessionCommandCheckpoint
  rollbackCommand: NormalizedAuthoritativeCommand
  rollbackInteractionKey: string
  failedCommandsAtCheckpoint: FailedAuthoritativeCommand[]
  guarded: boolean
}

type ActiveCommandSettlement = {
  command: NormalizedAuthoritativeCommand
  checkpoint: SessionCommandCheckpoint
  interactionKey: string
  scopeSnapshot: ProvisionalContinuationScope[]
  failedCommandSnapshot: FailedAuthoritativeCommand[]
  protectedObservations: ProtectedObservation[]
  provisional: boolean
  abortScopeId?: string
}

export type SessionPrivateCursor = Omit<SessionCommandCheckpoint, 'state'> & {
  provisionalContinuationScopes: ProvisionalContinuationScope[]
  failedAuthoritativeCommands: FailedAuthoritativeCommand[]
  nextProvisionalScopeId: number
}

const canonicalValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined && typeof entry !== 'function')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalValue(entry)]),
  )
}

const canonicalJson = (value: unknown): string => JSON.stringify(canonicalValue(value))

const cloneCommandValue = <T>(value: T): T => {
  if (Array.isArray(value)) return value.map((entry) => cloneCommandValue(entry)) as T
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => [key, cloneCommandValue(entry)]),
  ) as T
}

const commandValuesEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) &&
      left.length === right.length &&
      left.every((entry, index) => commandValuesEqual(entry, right[index]))
  }
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false
  const leftEntries = Object.entries(left)
  const rightRecord = right as Record<string, unknown>
  return leftEntries.length === Object.keys(rightRecord).length &&
    leftEntries.every(([key, entry]) =>
      Object.hasOwn(rightRecord, key) && commandValuesEqual(entry, rightRecord[key]))
}

const normalizedCommand = (
  type: string,
  playerIndex: number | null,
  payload?: unknown,
): NormalizedAuthoritativeCommand => ({
  type,
  key: canonicalJson({ type, playerIndex, payload }),
})

const ruleStateKey = (state: GameState): string => {
  const {
    log: _log,
    publicEventArchive: _publicEventArchive,
    nextEventSeq: _nextEventSeq,
    nextPublicEventArchivePacketSeq: _nextPublicEventArchivePacketSeq,
    ...rules
  } = state
  return canonicalJson(rules)
}

export type SessionResponse = {
  ok: boolean
  durableTransition?: boolean
  state: GameState
  interaction: InteractionState
  historyLength: number
  hasActionStartSnapshot: boolean
  scores?: PlayerScoreSummary[]
  pastureCapacities?: Record<string, Record<string, number>>
  actionAvailability?: Record<string, boolean>
  cardAvailability?: Record<string, boolean>
  privateEvents?: PrivateGameEvent[]
  publicEventCancellations?: PublicEventCancellation[]
  error?: string
}

type ResponseMetadata = {
  publicEventCancellations?: PublicEventCancellation[]
}

type PublicEventArchiveSnapshot = {
  publicEventArchive: GameState['publicEventArchive']
  nextPublicEventArchivePacketSeq: number
}

type PublicEventCancellationPlan = {
  publicEventCancellations?: PublicEventCancellation[]
  archiveAfterAppend?: PublicEventArchiveSnapshot
}

/**
 * Options for constructing a `GameCore`. Exported so that server-side
 * subclasses (`GameSession`) and other consumers can inject dependencies
 * without importing Node-only modules into the shared layer.
 */
/**
 * Pre-built state plus an `EngineStack` cursor produced by
 * `rehydrateState`. When supplied, `GameCore` will rebuild every
 * sub-flow frame in the stack via `Engine.restore` so that an in-flight
 * pending interaction (reorganize, choice, ...) survives a cold restart.
 */
export type StateWithCursor = {
  state: GameState
  sessionCursor?: SessionPrivateCursor
}

const isStateWithCursor = (value: unknown): value is StateWithCursor => {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    'state' in v &&
    typeof v.state === 'object' &&
    v.state !== null &&
    (!('sessionCursor' in v) || (
      typeof v.sessionCursor === 'object' &&
      v.sessionCursor !== null &&
      Array.isArray((v.sessionCursor as { engineStackCursor?: { frames?: unknown } }).engineStackCursor?.frames)
    ))
  )
}

export interface GameCoreOptions {
  /**
   * Pre-built state (object), seeded fresh state (number), or a state +
   * engine-stack cursor pair returned from `rehydrateState`.
   */
  stateOrSeed?: GameState | number | StateWithCursor
  /** Workshop custom cards to register into a per-session context. */
  customCards?: CustomCardData[]
  /** Options forwarded to `createInitialState`. */
  initialStateOptions?: InitialStateOptions
  /**
   * Optional extra registrar invoked during custom card registration. Server
   * passes its isolated-vm executor wrapper here; sandbox / browser contexts
   * leave it unset (defaults to a no-op).
   */
  registerCustomCardImpl?: (data: CustomCardData) => void
  /**
   * Optional pre-built per-session card registry. When omitted, `GameCore`
   * constructs a new `CardRegistry` and populates it from `ALL_CARD_IMPLS`.
   * The registry is published via `setActiveCardRegistry` so that any global
   * `registerCardListener` / `registerCardEffect` calls issued later (e.g.
   * custom-code cards at runtime) forward into this session's registry.
   */
  cardRegistry?: CardRegistry
}

/**
 * Build the InteractionSelection payload for an "occupation-hand" selection.
 * Reads actionContext: selectableCards (string[]), minSelections, maxSelections.
 * Falls back to the player's current occupationHand if selectableCards is absent.
 *
 * Inlined in PR5 from a former occupation-hand-interaction helper —
 * only used here, so kept local rather than surfacing on the domain facade.
 */
const buildOccupationHandSelectionInteraction = (
  player: PlayerState,
  actionContext?: Record<string, unknown>,
): InteractionSelection => {
  const raw = actionContext?.selectableCards
  const selectableCards = Array.isArray(raw)
    ? (raw as unknown[]).filter((v): v is string => typeof v === 'string')
    : player.occupationHand
  const minSelections = (actionContext?.minSelections as number) ?? 1
  const maxSelections = (actionContext?.maxSelections as number) ?? minSelections
  return { kind: 'occupation-hand', selectableCards, minSelections, maxSelections }
}

export class GameCore {
  /**
   * @internal phase access — the canonical GameState. Phase mixins read/write
   * `state.players` / `state.actionSpaces` / `state.log` / `state.round` etc
   * on every method, so wrapping each field in a getter/setter is impractical.
   * Keep this field public for `shared/session/phases/*` consumption only;
   * outside that directory the field is treated as if it were private.
   */
  state: GameState
  private engineStack = new EngineStack()
  // Read-only views backed by engineStack.current(). All writes go through
  // engineStack.push/pop or by mutating engineStack.current() fields directly.
  private get engine(): Engine | null { return this.engineStack.current()?.engine ?? null }
  private get engineSource(): EngineSource | null { return this.engineStack.current()?.source ?? null }
  private get activeSpaceId(): string | null { return this.engineStack.current()?.spaceId ?? null }
  private get activePlayerIndex(): number | null { return this.engineStack.current()?.ownerPlayerIndex ?? null }
  private get stageResume(): StageResumeState | null {
    return (this.engineStack.current()?.stageResume ?? null) as StageResumeState | null
  }
  private history: HistoryEntry[] = []
  private actionStartIndex: number | null = null
  private actionStartPlayerSnapshot: PlayerState | null = null
  private actionResultDetailsSinceFlush: { gains: Partial<Resource>; costs: Partial<Resource> } = {
    gains: {},
    costs: {},
  }
  private responsePrivateEvents: PrivateGameEvent[] = []
  private deferPrivateEventDrainDepth = 0
  /**
   * Supplies synthetic node ids and preferred Turn Scope tokens. Snapshot
   * state persists its own last token and raises stale values after reload;
   * synthetic ids may restart because each one is local to its Engine.
   */
  private nextActionToken = 1
  private turnOwnerPlayerIndex: number | null = null
  private provisionalContinuationScopes: ProvisionalContinuationScope[] = []
  private failedAuthoritativeCommands: FailedAuthoritativeCommand[] = []
  private activeCommandSettlement: ActiveCommandSettlement | null = null
  private commandSettlementDepth = 0
  private nextProvisionalScopeId = 1

  // ─────────────────────────────────────────────────────────────────────
  // S2 Tasks 9-12: internal accessor / mutator API for phase mixins.
  //
  // Phase classes in `shared/session/phases/` are organisationally split
  // out from this file but logically still part of the GameCore session
  // implementation. Rather than promoting each tightly-coupled private
  // field to public (which would expose the field to all of `shared/`),
  // each cross-module read/write goes through one of the named methods
  // below. This keeps a single insertion point for invariants, logs, and
  // metrics, and makes "who reaches into engineStack/history/turnOwner"
  // grep-discoverable.
  //
  // Accessor naming convention: `<verb><Subject>` (`pushEngineFrame`,
  // `setTurnOwner`, `allocActionToken`). Direct read of immutable derived
  // views (`peekEngineFrame`, `engineStackDepth`) skip the verb prefix.
  // ─────────────────────────────────────────────────────────────────────

  /** @internal phase access — push a new frame onto the engine stack. */
  pushEngineFrame(frame: EngineFrame): void { this.engineStack.push(frame) }
  /** @internal phase access — pop the top frame off the engine stack. */
  popEngineFrame(): EngineFrame | undefined { return this.engineStack.pop() }
  /** @internal phase access — current top frame (read-only view). */
  peekEngineFrame(): EngineFrame | undefined { return this.engineStack.current() }
  /** @internal phase access — mark the current frame's deferred player switch as confirmed. */
  confirmCurrentDeferredPlayerSwitch(fromPlayerIndex: number, toPlayerIndex: number): boolean {
    return this.engineStack.confirmDeferredPlayerSwitch(fromPlayerIndex, toPlayerIndex)
  }
  /** @internal phase access — current pending envelope if any. */
  peekEnginePendingEnvelope(): PendingEnvelope | null { return this.engineStack.peekPendingEnvelope() }
  /** @internal phase access — total stack depth. */
  engineStackDepth(): number { return this.engineStack.depth() }
  /** @internal phase access — drop all frames (used by confirm-next-player turn switch). */
  clearEngineStack(): void { this.engineStack.clear() }

  /** @internal phase access — append history entry (Round/Harvest/Draft mixins). */
  appendHistory(actionStart = false, undoBoundary = false): void { this.pushHistory(actionStart, undoBoundary) }
  /** @internal phase access — drop all history entries. */
  clearHistory(): void { this.history = [] }

  /** @internal phase access — set the player index whose turn is currently owned by this session run. */
  setTurnOwner(idx: number | null): void { this.turnOwnerPlayerIndex = idx }
  /** @internal phase access — read turnOwnerPlayerIndex. */
  getTurnOwner(): number | null { return this.turnOwnerPlayerIndex }

  /** @internal phase access — set the action-start index marker (used by undoAction). */
  setActionStartIndex(idx: number | null): void { this.actionStartIndex = idx }
  /** @internal phase access — read actionStartIndex. */
  getActionStartIndex(): number | null { return this.actionStartIndex }

  /** @internal phase access — capture pre-action player snapshot for stats / undo. */
  setActionStartPlayerSnapshot(snapshot: PlayerState | null): void { this.actionStartPlayerSnapshot = snapshot }

  /** @internal phase access — allocate next monotonic action token. */
  allocActionToken(): number { return this.nextActionToken++ }

  /** @internal phase access — reset per-action resource details from leaf results. */
  resetActionResultDetails(): void { this.actionResultDetailsSinceFlush = { gains: {}, costs: {} } }

  /** @internal phase access — emit a SessionResponse with the current state. */
  emitResponse(ok = true, error?: string, privateEvents?: PrivateGameEvent[]): SessionResponse {
    return this.respond(ok, error, privateEvents)
  }

  emitResponsePrivateEvent(event: PrivateGameEvent): void {
    this.responsePrivateEvents.push(event)
  }

  /** @internal phase access — drive the engine's step loop until it blocks. */
  driveEngineSteps(): void { this.withCtx(() => this.runEngineSteps()) }

  /** @internal phase access — flush queued log entries into the canonical log. */
  flushEngineLogPublic(): void { this.flushEngineLog() }

  /** @internal phase access — deep-clone a player snapshot. */
  cloneSessionPlayer(p: PlayerState): PlayerState { return this.clonePlayer(p) }

  /** @internal phase access — `place-farmer` after-hook injection chain. */
  invokePlaceFarmerAfterHooks(player: PlayerState, space: ActionSpace): boolean {
    return this.runPlaceFarmerAfterHooks(player, space)
  }
  /** @internal phase access — animal-reorg pivot detection used by Harvest/Round. */
  hasPendingAnimalsCheck(player: PlayerState): boolean { return this.hasPendingAnimals(player) }
  /** @internal phase access — start a reorganize sub-flow frame. */
  startReorgSubFlow(
    playerIndex: number,
    trigger: ReorganizeTrigger,
    options?: { originPlayerIndex?: number; triggerActionId?: string | null },
  ): void {
    this.startReorganizeSubFlow(playerIndex, trigger, options)
  }
  /** @internal phase access — synthetic pending id generator. */
  mintSyntheticNodeId(prefix: string): string { return this.nextSyntheticNodeId(prefix) }
  /** @internal phase access — Round phase listenersVetoIsDoable check. */
  listenersVetoIsDoableCheck(player: PlayerState, space: ActionSpace): boolean {
    return this.listenersVetoIsDoable(player, space)
  }
  /** @internal Harvest phase trampoline — kicks off the beforeHarvest stage hook chain. */
  invokeHarvestFromBeforeHarvest(): SessionResponse { return this.withCtx(() => this.continueHarvestFromBeforeHarvest()) }
  /** @internal Harvest phase trampoline — kicks off the breed-phase continuation chain. */
  invokeAfterFeedingPhase(): SessionResponse { return this.withCtx(() => this.continueAfterFeedingPhase()) }
  /** @internal Round phase trampoline — onAllWorkersPlaced + performRoundEnd cascade. */
  invokeAllWorkersPlacedHooks(): SessionResponse { return this.withCtx(() => this.continueAllWorkersPlacedHooks()) }
  /** @internal Round phase — set state.currentPlayerIndex (only by handleConfirmNextPlayerResolved). */
  setCurrentPlayerIndex(idx: number): void { this.state.currentPlayerIndex = idx }
  /** @internal Round phase — read activePlayerIndex view (engineStack-derived). */
  readActivePlayerIndex(): number | null { return this.activePlayerIndex }
  /** @internal Round phase — read activeSpaceId view (engineStack-derived). */
  readActiveSpaceId(): string | null { return this.activeSpaceId }
  /** @internal Round phase — pushHistory + undoBoundary helper exposed for handlers. */
  appendHistoryWithUndoBoundary(): void { this.pushHistory(false, true) }
  /** @internal Round phase — read engine on the current frame (used by takeAnytimeAction). */
  peekEngine(): import('../engine').Engine | null { return this.engine }
  /** @internal Round phase — read engineSource (used by takeAnytimeAction). */
  peekEngineSource(): EngineSource | null { return this.engineSource }
  /** @internal Round phase — engine context for ad-hoc anytime invocations. */
  buildAdhocEngineFrame(actionId: string, sourceCard: string | undefined, flowOverride?: ActionFlow): {
    engine: import('../engine').Engine; source: EngineSource
  } {
    const flow: ActionFlow = flowOverride ?? { type: 'leaf', actionId, sourceCard }
    return { engine: this.createFlowEngine(flow), source: { kind: 'flow', flow } }
  }
  /** @internal Round phase — enumerate currently-available anytime entries for the active interaction context. */
  listAnytimeEntries(): { descriptor: AnytimeAction; flow: ActionFlow }[] { return this.buildAnytimeEntries() }

  /** @internal — derive policy input from the current pending envelope. */
  private getAnytimePolicyInput(): AnytimePolicyInput {
    const view = this.engineStack.peekPendingView()
    const promptKey = view?.promptKey
    const request = view?.request
    return {
      hasActiveContext: !!this.getActiveInteractionContext(),
      stageResume: this.stageResume,
      interactionKind: request?.kind,
      promptKey,
    }
  }

  /** @internal — used by phases/round.ts takeAnytimeAction + buildInteraction allowedCommands sync. */
  computeAnytimePolicySnapshot(): AnytimePolicy {
    return computeAnytimePolicy(this.getAnytimePolicyInput())
  }
  /** @internal Round phase — finalize per-action stats / detail log. */
  invokeFinalizeActionLog(player: PlayerState): void { this.finalizeActionLog(player) }
  /** @internal Round phase — `state.round` after-harvest finalization. */
  invokeFinalizeRound(): void { this.finalizeRound() }
  /** @internal Round phase — onEndTurn stage hook trampoline. */
  invokeEndTurnHooks(playerIndex: number, triggerActionId?: string | null): SessionResponse {
    return this.withCtx(() => this.continueEndTurnHooks(playerIndex, 0, triggerActionId))
  }
  /** @internal Harvest phase — read the harvestRounds set (for returning-home decision). */
  isHarvestRound(round: number): boolean { return harvestRounds.includes(round) }
  /** @internal Harvest phase — find next player still owing a harvest-breed reorg. */
  findNextHarvestReorgPlayerIndex(playerIndex: number): number { return this.findNextHarvestReorgPlayer(playerIndex) }
  /** @internal Harvest phase — onEndHarvest stage hook chain trampoline. */
  invokeEndHarvestEffects(): SessionResponse { return this.withCtx(() => this.continueEndHarvestEffects()) }
  /** @internal Draft phase — assign processed draft state back. */
  setDraftState(draft: GameState['draft']): void { this.state.draft = draft }
  /** @internal Draft phase — finalize the draft (copies kept piles back to hands). */
  applyDraftFinalize(): void {
    this.state = finalizeDraft(this.state)
    startParentSelectionIfNeeded(this.state, this.parentSelectionSeed)
    ensureParentMotherScheduleLogs(this.state)
    // Refresh round-start snapshot so that subsequent takeAction / undo logic
    // sees the post-draft hands rather than the initial empty-handed snapshot.
    this.state.roundStartSnapshot = this.buildRoundSnapshot(this.state)
    if (
      this.state.phase === 'playing' &&
      this.state.futureMeeples.some((entry) => entry.round === this.state.round)
    ) {
      this.continueCurrentFutureMeepleActions()
    }
  }
  /** @internal Round phase — read the captured pre-action player snapshot. */
  getActionStartPlayerSnapshot(): PlayerState | null { return this.actionStartPlayerSnapshot }
  /** @internal Round phase — emit `log.actionDetail`. */
  invokeLogActionDetail(before: PlayerState, after: PlayerState): void { this.logActionDetail(before, after) }
  /** @internal Round phase — onBeforeReturnHome stage hook chain trampoline. */
  invokeBeforeReturnHomeHooks(): SessionResponse { return this.withCtx(() => this.continueBeforeReturnHomeHooks()) }
  /** @internal Round phase — onAfterRoundEnd stage hook chain trampoline. */
  invokeAfterRoundEnd(): SessionResponse { return this.withCtx(() => this.continueAfterRoundEnd()) }
  /** @internal Round phase — onRoundEnd stage hook chain trampoline. */
  invokeRoundEndHooks(): SessionResponse { return this.withCtx(() => this.continueRoundEndHooks()) }
  /** @internal phase access — build a fresh Engine for a top-level action space. */
  createEngineForSpace(actionId: string): Engine { return this.createEngine(actionId) }
  /** @internal phase access — push a synthetic pending-only frame. */
  pushSyntheticPendingFrame(envelope: PendingEnvelope, ownerPlayerIndex: number, reason: SubFlowReason): void {
    this.pushPendingFrame(envelope, ownerPlayerIndex, reason)
  }

  private registry: ActionRegistry
  private hookDispatcher: HookDispatcher
  private engineLog: LogStore
  private stageDispatch: StageDispatch
  private sessionCardContext: SessionCardContext | null = null
  private readonly parentSelectionSeed: number | undefined
  private readonly registerCustomCardImpl: (data: CustomCardData) => void
  private readonly cardRegistry: CardRegistry
  readonly cardWarnings: string[] = []

  constructor(options: GameCoreOptions = {}) {
    ensureCatalogLookupsInstalled()
    const { stateOrSeed, customCards, initialStateOptions, registerCustomCardImpl } = options
    const isFreshState = stateOrSeed === undefined || typeof stateOrSeed === 'number'
    this.parentSelectionSeed = initialStateOptions?.parentSelectionSeed
    this.registerCustomCardImpl = registerCustomCardImpl ?? (() => {
      // No-op default: used in sandbox mode (browser) or tests that don't need
      // the server-side executor-backed registrar.
    })
    this.registry = new ActionRegistry()
    actionDefinitions.forEach((a) => this.registry.register(a))
    seasonActionDefinitions.forEach((a) => this.registry.register(a))
    internalActionDefinitions.forEach((a) => this.registry.register(a))
    getAllAdHocActions().forEach((a) => this.registry.register(a))
    clearActionHooks()
    registerThroughTheSeasonsHooks()
    this.hookDispatcher = new HookDispatcher()
    this.engineLog = new LogStore()
    this.stageDispatch = new StageDispatch({
      getState: () => this.state,
      createFlowEngine: (flow, ownerPlayerIndex) => this.createFlowEngine(flow, ownerPlayerIndex),
      pushEngineFrame: (frame) => this.pushEngineFrame(frame),
      popEngineFrame: () => this.popEngineFrame(),
      driveEngineSteps: () => this.runEngineSteps(),
      withDeferredPrivateEventDrain: (fn) => {
        this.deferPrivateEventDrainDepth += 1
        try {
          fn()
        } finally {
          this.deferPrivateEventDrainDepth -= 1
        }
      },
      reportProtectedObservation: (observation) => this.reportProtectedObservation(observation),
    }, {
      onBeforeHarvest: (stageResume) => { this.continueHarvestFromBeforeHarvest(stageResume.playerIndex, stageResume.cardIndex) },
      harvestPrepWindow: (stageResume) => { this.continueHarvestPrepWindow(stageResume.playerIndex) },
      onAfterReap: (stageResume) => { this.continueAfterReapEffects(stageResume.playerIndex, stageResume.cardIndex) },
      afterHarvestReapReaction: (stageResume) => { this.continueAfterReapEffects(stageResume.playerIndex, stageResume.cardIndex) },
      onHarvest: (stageResume) => { this.continueHarvestEffects(stageResume.playerIndex, stageResume.cardIndex) },
      onEndHarvest: (stageResume) => { this.continueEndHarvestEffects(stageResume.playerIndex, stageResume.cardIndex) },
      onAfterHarvest: (stageResume) => { this.continueAfterHarvestEffects(stageResume.playerIndex, stageResume.cardIndex) },
      onBeforeStartOfTurn: (stageResume) => { this.continueBeforeStartOfTurn(stageResume.playerIndex, stageResume.cardIndex) },
      onBeforeWork: (stageResume) => { this.continueAfterFutureMeepleActions(stageResume.playerIndex, stageResume.cardIndex) },
      onRoundStart: (stageResume) => { this.continueAfterBeforeWork(stageResume.playerIndex, stageResume.cardIndex) },
      futureMeepleReceives: () => { this.continueFutureMeepleAnytimeWindow() },
      futureActionAnytimeWindow: (stageResume) => {
        this.continueFutureMeepleAnytimeWindow(
          stageResume.playerIndex,
          stageResume.extra?.anytimeActionTaken === true,
        )
      },
      futureMeepleActions: () => { this.continueAfterFutureMeepleActions() },
      onStartHarvestFeedingPhase: (stageResume) => {
        this.continueStartHarvestFeedingPhase(stageResume.playerIndex, stageResume.cardIndex)
      },
      onEndTurn: (stageResume) => {
        this.continueEndTurnHooks(
          stageResume.playerIndex,
          stageResume.cardIndex,
          stageResume.extra?.triggerActionId ?? null,
        )
      },
      onBeforeReturnHome: (stageResume) => { this.continueBeforeReturnHomeHooks(stageResume.playerIndex, stageResume.cardIndex) },
      onReturnHome: (stageResume) => { this.continueReturnHomeHooks(stageResume.playerIndex, stageResume.cardIndex) },
      onStartReturnHome: (stageResume) => { this.continueStartReturnHomeHooks(stageResume.playerIndex, stageResume.cardIndex) },
      onAfterRoundEnd: (stageResume) => { this.continueAfterRoundEnd(stageResume.playerIndex, stageResume.cardIndex) },
      onBeforeEndGame: (stageResume) => { this.continueBeforeEndGameHooks(stageResume.playerIndex, stageResume.cardIndex) },
      preScoringWindow: (stageResume) => {
        this.continuePreScoringWindow(
          stageResume.playerIndex + (stageResume.extra?.anytimeActionTaken ? 0 : 1),
        )
      },
      onStartHarvest: (stageResume) => { this.continueFromStartHarvest(stageResume.playerIndex, stageResume.cardIndex, stageResume.extra) },
      onStartHarvestFieldPhase: (stageResume) => { this.continueHarvestFieldStart(stageResume.playerIndex, stageResume.cardIndex) },
      onHarvestFieldPhase: (stageResume) => { this.continueHarvestFieldPhase(stageResume.playerIndex, stageResume.cardIndex) },
      onEndHarvestFieldPhase: (stageResume) => { this.continueEndFieldPhase(stageResume.playerIndex, stageResume.cardIndex) },
      onHarvestFeedingPhase: (stageResume) => { this.continueHarvestFeeding(stageResume.playerIndex, stageResume.cardIndex) },
      onEndHarvestFeedingPhase: (stageResume) => { this.continueAfterFeedingPhase(stageResume.playerIndex, stageResume.cardIndex) },
      onRoundEnd: (stageResume) => { this.continueRoundEndHooks(stageResume.playerIndex, stageResume.cardIndex) },
      onAllWorkersPlaced: (stageResume) => { this.continueAllWorkersPlacedHooks(stageResume.playerIndex, stageResume.cardIndex) },
      onBreedPhase: () => { this.continueEndHarvestEffects() },
      onReorganizeComplete: (stageResume) => { this.continueAfterSubFlow(stageResume) },
    })

    // Build or accept a per-session card registry, then publish it as the
    // active registry for legacy helper/test injection. Official entries are
    // protected from broad remove* cleanup; test/custom entries remain mutable.
    if (options.cardRegistry) {
      this.cardRegistry = options.cardRegistry
    } else {
      this.cardRegistry = new CardRegistry()
      for (const [cardId, impl] of Object.entries(ALL_CARD_IMPLS)) {
        this.cardRegistry.loadImpl(cardId, impl as CardImpl, { protected: true })
      }
    }
    this.cardRegistry.syncModifiersFromCatalog(
      allOccupationCards,
      allMinorImprovementCards,
    )
    registerThroughTheSeasonsCardListeners(this.cardRegistry)
    // Register majors as effect bundles so getCardEffect resolves them after
    // the older getMajorCardEffect path is removed.
    this.cardRegistry.registerEffects(majorCardDefinitions, { protected: true })
    setActiveCardRegistry(this.cardRegistry)
    queueMicrotask(() => {
      if (getActiveCardRegistry() === this.cardRegistry) {
        setActiveCardRegistry(this.cardRegistry.clone())
      }
    })

    // Register custom workshop cards into a per-session context (sandbox mode)
    if (customCards && customCards.length > 0) {
      this.sessionCardContext = new SessionCardContext(this.cardWarnings)
      withSessionContext(this.sessionCardContext, () => {
        for (const cardData of customCards!) {
          try {
            registerCustomCard(cardData)
            this.registerCustomCardImpl(cardData)
          } catch (err) {
            const msg = `Failed to register card ${cardData.cardJson.id}: ${err instanceof Error ? err.message : String(err)}`
            console.warn(`[game-core] ${msg}`)
            this.cardWarnings.push(msg)
          }
        }
      })
    }

    if (stateOrSeed && typeof stateOrSeed === 'object') {
      if (isStateWithCursor(stateOrSeed)) {
        this.state = normalizeState(stateOrSeed.state)
        this.syncDynamicActionSpaces()
        if (stateOrSeed.sessionCursor) this.restoreSessionPrivateCursor(stateOrSeed.sessionCursor)
        return
      }
      this.state = normalizeState(stateOrSeed)
    } else {
      const seed = typeof stateOrSeed === 'number' ? stateOrSeed : undefined
      const extraMinorIds = withSessionContext(this.sessionCardContext, () => getCustomMinorImprovementIds())
      const extraOccupationIds = withSessionContext(this.sessionCardContext, () => getCustomOccupationIds())
      this.state = createInitialState(seed, {
        ...initialStateOptions,
        extraMinorIds,
        extraOccupationIds,
      })
    }
    this.syncDynamicActionSpaces()
    if (
      isFreshState &&
      this.state.phase === 'playing' &&
      this.state.futureMeeples.some((entry) => entry.round === this.state.round)
    ) {
      this.continueCurrentFutureMeepleActions()
    }
    if (isFreshState) this.bindInitialLogPlayerIds()
  }

  /**
   * Read-only access to the EngineStack so that the serialization layer can
   * call `engineStack.toCursor()` when persisting the session. All writes
   * still go through GameCore's existing engineStack.push/pop sites.
   */
  getEngineStack(): EngineStack {
    return this.engineStack
  }

  createSessionPrivateCursor(): SessionPrivateCursor {
    const { state: _state, ...runtime } = this.createCommandCheckpoint()
    return JSON.parse(JSON.stringify({
      ...runtime,
      provisionalContinuationScopes: this.provisionalContinuationScopes,
      failedAuthoritativeCommands: this.failedAuthoritativeCommands,
      nextProvisionalScopeId: this.nextProvisionalScopeId,
    })) as SessionPrivateCursor
  }

  restoreSessionPrivateCursor(cursor: SessionPrivateCursor): void {
    const {
      provisionalContinuationScopes,
      failedAuthoritativeCommands,
      nextProvisionalScopeId,
      ...runtime
    } = structuredClone(cursor)
    this.restoreCommandCheckpoint({ state: this.state, ...runtime })
    this.provisionalContinuationScopes = provisionalContinuationScopes
    this.failedAuthoritativeCommands = failedAuthoritativeCommands
    this.nextProvisionalScopeId = nextProvisionalScopeId
  }

  createCommandCheckpoint(): SessionCommandCheckpoint {
    return this.withCtx(() => ({
      state: cloneCommandValue(this.state),
      engineStackCursor: structuredClone(this.engineStack.toCursor()),
      history: this.history.slice(),
      actionStartIndex: this.actionStartIndex,
      actionStartPlayerSnapshot: this.actionStartPlayerSnapshot
        ? this.clonePlayer(this.actionStartPlayerSnapshot)
        : null,
      actionResultDetailsSinceFlush: structuredClone(this.actionResultDetailsSinceFlush),
      responsePrivateEvents: structuredClone(this.responsePrivateEvents),
      deferPrivateEventDrainDepth: this.deferPrivateEventDrainDepth,
      nextActionToken: this.nextActionToken,
      turnOwnerPlayerIndex: this.turnOwnerPlayerIndex,
      engineLog: structuredClone(this.engineLog.all()),
      cardWarningCount: this.cardWarnings.length,
    }))
  }

  restoreCommandCheckpoint(checkpoint: SessionCommandCheckpoint): void {
    this.withCtx(() => {
      if (!commandValuesEqual(this.state, checkpoint.state)) {
        this.state = cloneCommandValue(checkpoint.state)
        for (const space of this.state.actionSpaces) {
          const definition = this.registry.get(space.id)
          if (!definition) continue
          space.canBeExecutedByPlayer ??= definition.canBeExecutedByPlayer
          space.execute ??= definition.execute
          space.resolveChoice ??= definition.resolveChoice
          space.flow ??= definition.flow
        }
        this.syncDynamicActionSpaces()
      }
      this.engineStack.clear()
      if (checkpoint.engineStackCursor.frames.length > 0) {
        this.restoreEngineStackFromCursor(checkpoint.engineStackCursor)
      }
      this.history = checkpoint.history
      this.actionStartIndex = checkpoint.actionStartIndex
      this.actionStartPlayerSnapshot = checkpoint.actionStartPlayerSnapshot
      this.actionResultDetailsSinceFlush = checkpoint.actionResultDetailsSinceFlush
      this.responsePrivateEvents = checkpoint.responsePrivateEvents
      this.deferPrivateEventDrainDepth = checkpoint.deferPrivateEventDrainDepth
      this.nextActionToken = checkpoint.nextActionToken
      this.turnOwnerPlayerIndex = checkpoint.turnOwnerPlayerIndex
      this.engineLog.restore(checkpoint.engineLog)
      this.cardWarnings.length = checkpoint.cardWarningCount
    })
  }

  private restoreEngineStackFromCursor(cursor: EngineStackCursor): void {
    if (!cursor || cursor.frames.length === 0) return
    this.engineStack = EngineStack.fromCursor(cursor, (source, snapshot, frame) => {
      const engine = this.createEngineFromSource(source, frame.ownerPlayerIndex)
      engine.restore(snapshot)
      return engine
    })
    // Capture the pre-`runEngineSteps` pending host id so the dev-only
    // assert below can detect a non-idempotent `proceed()` (Task 8 reviewer
    // Important): if `runEngineSteps` advances the pending host out from
    // under the freshly-restored cursor we silently lose the client's
    // already-shown prompt and the next ServerEvent surfaces a different
    // request. The assert is a cheap canary — it has no production cost
    // because the comparison is a string equality.
    const preRestoreNodeId = this.engineStack.peekPendingHost()?.id ?? null
    // Task 10: the previous GameCore pending field is gone — every consumer
    // derives the PendingAction response shape from the current pending
    // envelope. No dual-write rebuild is needed; the envelope survived the cursor round-trip with its
    // `request` and `choices` intact, which is the single source of truth.
    //
    // Re-run engine steps so the freshly-restored frame proceeds through any
    // already-emitted choice node. `proceed()` is idempotent on a still-
    // pending host (it re-emits `step.type === 'choice'`), so the
    // canonical pre/post pending-host-id assert below catches drift.
    this.runEngineSteps()
    // Cross-platform NODE_ENV check that works in both Node (server) and
    // browser (esbuild-style `process.env.NODE_ENV` replacement). Vite/Rollup
    // shim `process.env.NODE_ENV` for browser bundles, while Node has the
    // real `process`; both expose the value via this guarded access.
    const env =
      (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV
    if (env !== 'production') {
      const postRestoreNodeId = this.engineStack.peekPendingHost()?.id ?? null
      if (
        preRestoreNodeId !== null &&
        postRestoreNodeId !== null &&
        preRestoreNodeId !== postRestoreNodeId
      ) {
        throw new Error(
          `non-idempotent proceed detected during restoreEngineStackFromCursor: ` +
            `pre=${preRestoreNodeId} post=${postRestoreNodeId}`,
        )
      }
    }
  }

  private syncDynamicActionSpaces() {
    for (const space of this.state.actionSpaces) {
      if (!this.registry.get(space.id)) {
        this.registry.register(space)
      }
    }
  }

  /** Run a function with this session's card context active. */
  withCtx<T>(fn: () => T): T {
    return withActiveRegistry(this.cardRegistry, () => withSessionContext(this.sessionCardContext, fn))
  }

  private currentInteractionKey(): string {
    const frame = this.engineStack.current()
    const view = this.engineStack.peekPendingView()
    const cursor = this.engineStack.peekPendingCursor()
    return canonicalJson({
      phase: this.state.phase,
      currentPlayerIndex: this.state.currentPlayerIndex,
      frameId: frame?.frameId,
      frameReason: frame?.reason,
      hostNodeId: cursor?.hostNodeId,
      pendingActionId: cursor?.pendingActionId,
      requestKind: view?.request.kind,
      promptKey: view?.promptKey,
      effectiveOwnerPlayerId: view?.effectiveOwnerPlayerId,
    })
  }

  private refreshFailedAuthoritativeCommands(): string | null {
    if (this.failedAuthoritativeCommands.length === 0) return null
    const currentRuleStateKey = ruleStateKey(this.state)
    const activeFrameIds = new Set(
      this.engineStack.allFrames().flatMap((frame) => frame.frameId ? [frame.frameId] : []),
    )
    this.failedAuthoritativeCommands = this.failedAuthoritativeCommands.filter(
      (entry) => entry.ruleStateKey === currentRuleStateKey &&
        (!entry.bindingFrameId || activeFrameIds.has(entry.bindingFrameId)),
    )
    return currentRuleStateKey
  }

  private isFailedAuthoritativeCommand(command: NormalizedAuthoritativeCommand): boolean {
    if (this.failedAuthoritativeCommands.length === 0) return false
    const currentRuleStateKey = this.refreshFailedAuthoritativeCommands()
    const interactionKey = this.currentInteractionKey()
    return this.failedAuthoritativeCommands.some((entry) =>
      entry.commandKey === command.key &&
      entry.interactionKey === interactionKey &&
      entry.ruleStateKey === currentRuleStateKey,
    )
  }

  private rememberFailedAuthoritativeCommand(
    command: NormalizedAuthoritativeCommand,
    interactionKey = this.currentInteractionKey(),
  ): void {
    const bindingFrameId = this.engineStack.current()?.frameId
    const entry = {
      commandKey: command.key,
      interactionKey,
      ruleStateKey: ruleStateKey(this.state),
      ...(bindingFrameId ? { bindingFrameId } : {}),
    }
    if (!this.failedAuthoritativeCommands.some((candidate) =>
      candidate.commandKey === entry.commandKey &&
      candidate.interactionKey === entry.interactionKey &&
      candidate.ruleStateKey === entry.ruleStateKey,
    )) {
      this.failedAuthoritativeCommands.push(entry)
    }
  }

  private canInterleaveAnytimeAction(): boolean {
    return this.provisionalContinuationScopes.every((scope) => !scope.guarded)
  }

  private runAuthoritativeCommand(
    type: string,
    playerIndex: number | null,
    payload: unknown,
    run: () => SessionResponse,
  ): SessionResponse {
    return this.withCtx(() => {
      if (this.commandSettlementDepth > 0) return run()
      const command = normalizedCommand(type, playerIndex, payload)
      if (type === 'anytime' && !this.canInterleaveAnytimeAction()) {
        return this.respond(false, 'anytime action unavailable during mandatory continuation')
      }
      if (this.isFailedAuthoritativeCommand(command)) {
        return this.respond(false, 'command unavailable until game state changes')
      }
      const settlement: ActiveCommandSettlement = {
        command,
        checkpoint: this.createCommandCheckpoint(),
        interactionKey: this.currentInteractionKey(),
        scopeSnapshot: this.provisionalContinuationScopes.map((scope) => ({
          ...scope,
          failedCommandsAtCheckpoint: scope.failedCommandsAtCheckpoint.map((entry) => ({ ...entry })),
        })),
        failedCommandSnapshot: this.failedAuthoritativeCommands.map((entry) => ({ ...entry })),
        protectedObservations: [],
        provisional: this.provisionalContinuationScopes.length > 0,
      }
      this.activeCommandSettlement = settlement
      this.commandSettlementDepth = 1
      try {
        const response = run()
        const warnings = this.cardWarnings.slice(settlement.checkpoint.cardWarningCount)
        if (warnings.length > 0) {
          this.restoreCommandCheckpoint(settlement.checkpoint)
          this.provisionalContinuationScopes = settlement.scopeSnapshot
          this.failedAuthoritativeCommands = settlement.failedCommandSnapshot
          this.cardWarnings.push(...warnings)
          return this.respond(false, warnings.join('; '))
        }
        return this.settleAuthoritativeCommand(response, settlement)
      } catch (error) {
        const warnings = this.cardWarnings.slice(settlement.checkpoint.cardWarningCount)
        this.restoreCommandCheckpoint(settlement.checkpoint)
        this.provisionalContinuationScopes = settlement.scopeSnapshot
        this.failedAuthoritativeCommands = settlement.failedCommandSnapshot
        this.cardWarnings.push(...warnings)
        throw error
      } finally {
        this.activeCommandSettlement = null
        this.commandSettlementDepth = 0
      }
    })
  }

  private mandatoryContinuationProbes(): Array<MandatoryContinuationProbe & { frameId: string }> {
    const probes: Array<MandatoryContinuationProbe & { frameId: string }> = []
    for (const frame of this.engineStack.allFrames()) {
      if (!frame.frameId) continue
      const space = this.getSpaceById(frame.spaceId) ?? this.createSyntheticSpace(frame.spaceId)
      const ownerPlayerId = this.state.players[frame.ownerPlayerIndex]?.id
      if (!ownerPlayerId) continue
      probes.push(...frame.engine.probeMandatoryContinuations(
        this.state,
        space,
        ownerPlayerId,
      ).map((probe) => ({ ...probe, frameId: frame.frameId! })))
    }
    return probes
  }

  private openProvisionalScopesForRisk(): void {
    const settlement = this.activeCommandSettlement
    if (!settlement) return
    const probes = this.mandatoryContinuationProbes()
    const byHost = new Map(probes.map((probe) => [`${probe.frameId}:${probe.nodeId}`, probe]))
    const depth = (probe: MandatoryContinuationProbe & { frameId: string }): number => {
      let current = probe
      let result = 0
      const seen = new Set<string>()
      while (current.parentHostNodeId) {
        const key = `${current.frameId}:${current.parentHostNodeId}`
        if (seen.has(key)) break
        seen.add(key)
        const parent = byHost.get(key)
        if (!parent) break
        result += 1
        current = parent
      }
      return result
    }
    probes.sort((left, right) => depth(left) - depth(right))
    for (const probe of probes) {
      if (this.provisionalContinuationScopes.some((scope) =>
        scope.frameId === probe.frameId && scope.hostNodeId === probe.nodeId,
      )) continue
      const directParent = probe.parentHostNodeId
        ? this.provisionalContinuationScopes.find((scope) =>
            scope.frameId === probe.frameId && scope.hostNodeId === probe.parentHostNodeId,
          )
        : undefined
      const parentScope = directParent
      this.provisionalContinuationScopes.push({
        id: `provisional-scope-${this.nextProvisionalScopeId++}`,
        frameId: probe.frameId,
        hostNodeId: probe.nodeId,
        ...(parentScope ? { parentScopeId: parentScope.id } : {}),
        checkpoint: settlement.checkpoint,
        rollbackCommand: settlement.command,
        rollbackInteractionKey: settlement.interactionKey,
        failedCommandsAtCheckpoint: settlement.failedCommandSnapshot.map((entry) => ({ ...entry })),
        guarded: probe.strictDoable,
      })
      settlement.provisional = true
    }
  }

  private reportProtectedObservation(observation: ProtectedObservation): void {
    if (!this.activeCommandSettlement) return
    this.openProvisionalScopesForRisk()
    this.activeCommandSettlement.protectedObservations.push(structuredClone(observation))
  }

  private markProvisionalHostBlocked(frame: EngineFrame, nodeId: string): boolean {
    const scope = this.provisionalContinuationScopes.find((entry) =>
      entry.frameId === frame.frameId && entry.hostNodeId === nodeId,
    )
    if (!scope || !this.activeCommandSettlement) return false
    this.activeCommandSettlement.abortScopeId = scope.id
    return true
  }

  private rejectCurrentCommand(settlement: ActiveCommandSettlement): SessionResponse {
    this.restoreCommandCheckpoint(settlement.checkpoint)
    this.provisionalContinuationScopes = settlement.scopeSnapshot
    this.failedAuthoritativeCommands = settlement.failedCommandSnapshot
    this.rememberFailedAuthoritativeCommand(settlement.command, settlement.interactionKey)
    return {
      ...this.respond(false, 'command would break a mandatory continuation'),
      durableTransition: true,
    }
  }

  private abortProvisionalScope(scope: ProvisionalContinuationScope): SessionResponse {
    const removed = new Set([scope.id])
    let changed = true
    while (changed) {
      changed = false
      for (const candidate of this.provisionalContinuationScopes) {
        if (candidate.parentScopeId && removed.has(candidate.parentScopeId) && !removed.has(candidate.id)) {
          removed.add(candidate.id)
          changed = true
        }
      }
    }
    const retained = this.provisionalContinuationScopes.filter((candidate) => !removed.has(candidate.id))
    this.restoreCommandCheckpoint(scope.checkpoint)
    const restoredProbes = new Map(this.mandatoryContinuationProbes().map((probe) => [
      `${probe.frameId}:${probe.nodeId}`,
      probe,
    ]))
    this.provisionalContinuationScopes = retained.flatMap((candidate) => {
      const probe = restoredProbes.get(`${candidate.frameId}:${candidate.hostNodeId}`)
      return probe ? [{ ...candidate, guarded: probe.strictDoable }] : []
    })
    this.failedAuthoritativeCommands = scope.failedCommandsAtCheckpoint.map((entry) => ({ ...entry }))
    this.rememberFailedAuthoritativeCommand(scope.rollbackCommand, scope.rollbackInteractionKey)
    this.state.log.unshift({ key: 'log.provisionalContinuationRollback' })
    return this.respond()
  }

  private settleAuthoritativeCommand(
    response: SessionResponse,
    settlement: ActiveCommandSettlement,
  ): SessionResponse {
    if (settlement.abortScopeId) {
      const scope = this.provisionalContinuationScopes.find((entry) => entry.id === settlement.abortScopeId)
      if (scope) {
        return scope.guarded
          ? this.rejectCurrentCommand(settlement)
          : this.abortProvisionalScope(scope)
      }
    }
    const probes = new Map(this.mandatoryContinuationProbes().map((probe) => [
      `${probe.frameId}:${probe.nodeId}`,
      probe,
    ]))
    const completedScopeIds = new Set<string>()
    for (const scope of this.provisionalContinuationScopes) {
      const probe = probes.get(`${scope.frameId}:${scope.hostNodeId}`)
      if (!probe) {
        completedScopeIds.add(scope.id)
        continue
      }
      if (probe.strictDoable) {
        scope.guarded = true
      } else if (scope.guarded) {
        return this.rejectCurrentCommand(settlement)
      }
    }
    if (
      settlement.protectedObservations.length > 0 &&
      this.provisionalContinuationScopes.some((scope) => !scope.guarded)
    ) {
      return this.rejectCurrentCommand(settlement)
    }
    if (completedScopeIds.size > 0) {
      this.provisionalContinuationScopes = this.provisionalContinuationScopes
        .filter((scope) => !completedScopeIds.has(scope.id))
        .map((scope) => scope.parentScopeId && completedScopeIds.has(scope.parentScopeId)
          ? { ...scope, parentScopeId: undefined }
          : scope)
    }
    this.refreshFailedAuthoritativeCommands()
    if (!settlement.provisional) return response
    return {
      ...this.respond(
        response.ok,
        response.error,
        response.privateEvents,
        response.publicEventCancellations
          ? { publicEventCancellations: response.publicEventCancellations }
          : {},
      ),
      durableTransition: response.ok || response.durableTransition === true,
    }
  }

  /** Dispose of session resources. Call when replacing or removing a session. */
  dispose(): void {
    this.sessionCardContext?.dispose()
    this.sessionCardContext = null
  }

  /**
   * Export custom card definitions for the frontend.
   * Returns an array of { cardType, cardJson } for each custom card in this session.
   * Frontend uses this to register custom cards into its card registry so they
   * render identically to built-in cards.
   */
  getCustomCardDefs(): import('../contract/protocol/game.ts').CustomCardDef[] {
    return setupPhase.getCustomCardDefs(this.sessionCardContext)
  }

  /** Update a player's display name in the game state (called after WS join). */
  updatePlayerName(playerIndex: number, name: string): void {
    const player = this.state.players[playerIndex]
    const previousName = player?.name
    setupPhase.updatePlayerName(player, name)
    if (!previousName || !player || previousName === player.name) return
    for (const entry of this.state.log) {
      if (entry.playerId === player.id && entry.params) entry.params.player = player.name
    }
  }

  private bindInitialLogPlayerIds(): void {
    const playerIdsByName = new Map<string, string | null>()
    for (const player of this.state.players) {
      playerIdsByName.set(player.name, playerIdsByName.has(player.name) ? null : player.id)
    }
    for (const entry of this.state.log) {
      const playerName = entry.params?.player
      if (typeof playerName !== 'string') continue
      const playerId = playerIdsByName.get(playerName)
      if (playerId) entry.playerId = playerId
    }
  }

  private engineDeps() {
    return {
      registry: this.registry,
      hooks: this.hookDispatcher,
      log: this.engineLog,
    }
  }

  private runPlaceFarmerAfterHooks(
    player: PlayerState,
    space: ActionSpace,
  ): boolean {
    const context = {
      state: this.state,
      player,
      space,
      actionId: 'place-farmer',
      phase: 'after' as const,
      result: { type: 'ok' as const },
    }
    const matched = getMatchingListeners(context)
    if (matched.length === 0) return false

    const newEngine = Engine.fromBuiltNodes(this.engineDeps(), (internals) =>
      buildPhaseTrailingNodes(
        internals,
        matched,
        'after',
        'place-farmer',
        this.state,
        {},
        context.player.id,
        undefined,
        undefined,
        undefined,
        createTriggerSnapshot(this.state),
      ),
    )
    if (!newEngine) return false
    const frame = this.engineStack.current()
    if (!frame) return false
    return this.engineStack.replaceCurrentFrameEngine(newEngine, {
      kind: 'flow',
      flow: { type: 'seq', children: [] },
    })
  }

  private createFlowEngine(
    flow: ActionFlow,
    ownerPlayerIndex = this.activePlayerIndex ?? this.state.currentPlayerIndex,
  ): Engine {
    const ownerPlayerId = this.state.players[ownerPlayerIndex]?.id
    return Engine.fromFlow(flow, this.engineDeps(), ownerPlayerId)
  }

  private startReorganizeSubFlow(
    playerIndex: number,
    trigger: import('../actions/effects/reorganize').ReorganizeTrigger,
    resumeExtra: { originPlayerIndex?: number | null; triggerActionId?: string | null } = {},
  ): void {
    const player = this.state.players[playerIndex]
    if (!player) return
    const flow: ActionFlow = {
      type: 'leaf',
      actionId: 'reorganize',
      actionContext: { trigger },
    }
    this.engineStack.push({
      engine: this.createFlowEngine(flow, playerIndex),
      source: { kind: 'flow', flow },
      ownerPlayerIndex: playerIndex,
      spaceId: subflowSpaceId('reorganize'),
      stageResume: {
        hook: 'onReorganizeComplete',
        playerIndex,
        cardIndex: 0,
        extra: {
          trigger,
          originPlayerIndex: resumeExtra.originPlayerIndex ?? null,
          triggerActionId: resumeExtra.triggerActionId ?? null,
        },
      },
      deferredPlayerSwitch: null,
      reason: 'reorganize',
    })
    this.runEngineSteps()
  }

  private startTopLevelReorganizeFlow(playerIndex: number): void {
    const flow: ActionFlow = {
      type: 'leaf',
      actionId: 'reorganize',
      actionContext: { trigger: 'anytime' },
    }
    this.engineStack.push({
      engine: this.createFlowEngine(flow, playerIndex),
      source: { kind: 'flow', flow },
      ownerPlayerIndex: playerIndex,
      spaceId: '__subflow:top-level',
      stageResume: null,
      deferredPlayerSwitch: null,
      reason: 'top-level',
    })
    this.runEngineSteps()
  }

  /**
   * Synthetic frame factory used by the start*-confirm/start*-feed triggers.
   * Pushes an `__interaction_only__` leaf flow frame whose root engine node
   * already owns the pending envelope.
   */
  private pushPendingFrame(
    envelope: PendingEnvelope,
    ownerPlayerIndex: number,
    reason: SubFlowReason,
  ): void {
    const flow: ActionFlow = { type: 'leaf', actionId: INTERACTION_ONLY_ACTION_ID }
    const owner = this.state.players[ownerPlayerIndex]
    const engine = Engine.fromPendingEnvelope(envelope, this.engineDeps(), owner?.id)
    this.engineStack.push({
      engine,
      source: { kind: 'flow', flow },
      ownerPlayerIndex,
      spaceId: subflowSpaceId(reason),
      stageResume: null,
      deferredPlayerSwitch: null,
      reason,
    })
  }

  private nextSyntheticNodeId(prefix: string): string {
    return `${prefix}-${this.nextActionToken++}`
  }

  /** S2 Task 10: thin delegator retained because internal handlers still call it. */
  private startConfirmPlayerSwitch(fromPlayerIndex: number, toPlayerIndex: number): void {
    this.openProvisionalScopesForRisk()
    roundPhase.startConfirmPlayerSwitch(this, fromPlayerIndex, toPlayerIndex)
  }
  private startFeedSubFlow(
    playerIndex: number,
    remaining: number,
    foodUsed: number,
    feedQueue?: FeedQueueEntry[],
  ): void {
    const player = this.state.players[playerIndex]
    roundPhase.startFeedSubFlow(
      this,
      playerIndex,
      remaining,
      foodUsed,
      feedQueue,
      player ? this.getHarvestExchangeLimits(player) : undefined,
    )
  }
  private startPostReapAnytimeSubFlow(playerIndex: number): void {
    const options = [{ value: '__skip__', labelKey: 'ui.interactionOptionalSkip' }]
    this.pushPendingFrame({
      hostNodeId: this.nextSyntheticNodeId('interaction:post-reap-anytime'),
      request: { kind: 'choice', options },
      choices: options,
      promptKey: 'ui.interactionOptionalAction',
      ownerNodeId: null,
      syntheticKind: 'post-reap-anytime',
    }, playerIndex, 'post-reap-anytime')
  }
  private startHeatingSubFlow(
    playerIndex: number,
    required: number,
    feedQueue?: FeedQueueEntry[],
  ): void {
    roundPhase.startHeatingSubFlow(this, playerIndex, required, feedQueue)
  }

  private createEngine(
    actionId: string,
    ownerPlayerIndex = this.state.currentPlayerIndex,
  ): Engine {
    return Engine.fromAction(actionId, this.engineDeps(), this.state.players[ownerPlayerIndex]?.id)
  }

  private createEngineFromSource(
    source: EngineSource,
    ownerPlayerIndex = this.state.currentPlayerIndex,
  ): Engine {
    return source.kind === 'action'
      ? this.createEngine(source.actionId, ownerPlayerIndex)
      : this.createFlowEngine(source.flow, ownerPlayerIndex)
  }

  private clonePlayer(p: PlayerState): PlayerState {
    try { return structuredClone(p) } catch { return JSON.parse(JSON.stringify(p)) as PlayerState }
  }

  private getAnimalCount(p: PlayerState) {
    return animalKeysForState(this.state).reduce((sum, key) => sum + (p.resources[key] ?? 0), 0)
  }

  private getAssignedAnimalCountForPending(p: PlayerState) {
    const idx = this.state.players.indexOf(p)
    const animalKeys = animalKeysForState(this.state)
    if (idx < 0) return 0
    let assigned = 0
    for (const zone of playerBoard(this.state, idx).animals.zones()) {
      const zoneCounts = readAnimalCountsForZoneAssignment(zone)
      for (const key of animalKeys) {
        assigned += zoneCounts[key] ?? 0
      }
    }
    return assigned
  }

  private hasPendingAnimals(p: PlayerState) {
    return this.getAnimalCount(p) > this.getAssignedAnimalCountForPending(p)
  }

  private getHarvestPlayerIndices() {
    return harvestPhase.getHarvestPlayerIndices(this.state)
  }

  /**
   * True when the player has a card that flagged them to skip the field +
   * breeding phase of the current harvest. Cards register the skip by writing
   * `cardStates[CARD_ID].extraData.passFieldAndBreedRound = state.round` (e.g.
   * E58 LunchtimeBeer's onStartHarvest opt-in). The flag naturally expires
   * next round — we compare against the current round on every check.
   */
  private hasPassFieldAndBreed(player: PlayerState): boolean {
    const cardStates = player.cardStates ?? {}
    for (const cardId of Object.keys(cardStates)) {
      const round = cardStates[cardId]?.extraData?.passFieldAndBreedRound
      if (typeof round === 'number' && round === this.state.round) {
        return true
      }
    }
    return false
  }

  private hasPositiveResources(resources: Partial<Resource>) {
    return resourceKeyList.some((key) => (resources[key] ?? 0) > 0)
  }

  private logHarvestResourceEntry(key: string, player: PlayerState, resources: Partial<Resource>) {
    if (!this.hasPositiveResources(resources)) return
    if (key === 'log.harvestFeedDetail') {
      appendImmediateEvents(this.state, [{
        type: 'resource.paid',
        resources,
        paymentFor: 'feeding',
        paymentSources: [{ from: { kind: 'player', playerId: player.id }, resources }],
      }], {
        actorPlayerId: player.id,
        sourceActionId: 'harvest-feeding',
      })
    }
  }

  private hasAnyHarvestExchange(player: PlayerState) {
    const harvestExchange = getExchangesInWindow(player, 'harvest', this.state).some((trade) => {
      const sourceId = trade.sourceId ?? trade.source
      return !!sourceId
        && canAffordTrade(player, trade)
        && getRemainingHarvestExchangeUses(player, sourceId, trade.max, this.state.round) > 0
    })
    return harvestExchange || getExchangesInWindow(player, 'anytime', this.state).some((trade) =>
      canAffordTrade(player, trade),
    )
  }

  private getHarvestExchangeLimits(player: PlayerState): Record<string, number> {
    const limits: Record<string, number> = {}
    for (const trade of getExchangesInWindow(player, 'harvest', this.state)) {
      const sourceId = trade.sourceId ?? trade.source
      if (!sourceId || trade.max === undefined) continue
      const remaining = getRemainingHarvestExchangeUses(player, sourceId, trade.max, this.state.round)
      limits[sourceId] = Math.max(limits[sourceId] ?? 0, remaining)
    }
    return limits
  }

  private countReapedHarvestGood(player: PlayerState, resource: ResourceKey): number {
    if (resource !== 'grain' && resource !== 'vegetable') return 0
    return player.fields.filter((field) =>
      field.stacks.some((stack) => stack.kind === resource && stack.remaining > 0),
    ).length
  }

  private buildHarvestPrepFlow(player: PlayerState): ActionFlow | undefined {
    const beforeReapDemand = new Map<ResourceKey, number>()
    const afterReapDemand = new Map<ResourceKey, number>()
    const cardIds = [
      ...player.improvements,
      ...player.minorPlayed,
      ...player.occupationPlayed,
    ]
    const effects = cardIds.map((cardId) => getCardEffect(cardId))
    const maySkipFieldPhase = effects.some((effect) => effect?.maySkipHarvestFieldPhase)
    for (const effect of effects) {
      for (const resource of effect?.preHarvestGoodsWantedBeforeReap ?? []) {
        beforeReapDemand.set(resource, (beforeReapDemand.get(resource) ?? 0) + 1)
      }
      for (const resource of effect?.preHarvestGoodsWanted ?? []) {
        afterReapDemand.set(resource, (afterReapDemand.get(resource) ?? 0) + 1)
      }
    }
    const wanted = new Set([...beforeReapDemand.keys(), ...afterReapDemand.keys()].filter((resource) => {
      const current = player.resources[resource] ?? 0
      const beforeReap = beforeReapDemand.get(resource) ?? 0
      const afterReap = afterReapDemand.get(resource) ?? 0
      const reaped = maySkipFieldPhase ? 0 : this.countReapedHarvestGood(player, resource)
      return current < beforeReap || current + reaped < beforeReap + afterReap
    }))
    if (wanted.size === 0) return

    const sourceIds: string[] = []
    const maxTradeTimesBySourceId: Record<string, number> = {}
    for (const trade of getExchangesInWindow(player, 'harvest', this.state)) {
      const sourceId = trade.sourceId ?? trade.source
      if (!sourceId || !canAffordTrade(player, trade)) continue
      if (!Object.entries(trade.to).some(([resource, amount]) =>
        (amount ?? 0) > 0 && wanted.has(resource as ResourceKey),
      )) continue
      const remaining = getRemainingHarvestExchangeUses(player, sourceId, trade.max, this.state.round)
      if (remaining <= 0) continue
      if (!sourceIds.includes(sourceId)) sourceIds.push(sourceId)
      if (Number.isFinite(remaining)) {
        maxTradeTimesBySourceId[sourceId] = Math.max(
          maxTradeTimesBySourceId[sourceId] ?? 0,
          remaining,
        )
      }
    }
    if (sourceIds.length === 0) return

    return {
      type: 'leaf',
      actionId: 'exchange',
      actionContext: {
        tradeIds: sourceIds,
        maxTradeTimesBySourceId,
        harvestExchangeRound: this.state.round,
      },
    }
  }

  private findNextHarvestReorgPlayer(afterPlayerIndex: number) {
    const order = this.getHarvestPlayerIndices()
    const currentOrderIndex = order.indexOf(afterPlayerIndex)
    if (currentOrderIndex === -1) return -1
    for (let offset = 1; offset < order.length; offset += 1) {
      const nextIndex = order[(currentOrderIndex + offset) % order.length]
      const player = nextIndex === undefined ? null : this.state.players[nextIndex]
      if (player && this.hasPendingAnimals(player)) {
        return nextIndex
      }
    }
    return -1
  }

  private createSyntheticSpace(id: string): ActionSpace {
    return {
      id,
      nameKey: 'ui.interactionOptionalAction',
      descriptionKey: 'ui.interactionOptionalAction',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({ type: 'ok' }),
      resources: { ...emptyResources },
      takenBy: [],
    }
  }

  private getSpaceById(spaceId: string | null): ActionSpace | null {
    if (!spaceId) return null
    return findActionSpaceById(this.state, spaceId)
      ?? (isMoorSpecialActionId(spaceId) ? createMoorSpecialActionSpace(spaceId) : null)
      ?? (spaceId.startsWith(SUBFLOW_SPACE_PREFIX) || spaceId.startsWith('__stage:')
        ? this.createSyntheticSpace(spaceId)
        : null)
  }

  private getActiveInteractionContext() {
    const playerIndex = this.activePlayerIndex ?? (this.engineStack.depth() === 0 ? this.state.currentPlayerIndex : null)
    const spaceId = this.activeSpaceId ?? (this.engineStack.depth() === 0 ? subflowSpaceId('top-level') : null)
    if (playerIndex === null || !spaceId) return null
    const player = this.state.players[playerIndex]
    const space = this.getSpaceById(spaceId)
    if (!player || !space) return null
    return { player, space }
  }

  private isFarmPromptKey(promptKey?: string) {
    switch (promptKey) {
      case 'ui.interactionFenceSelect':
        return 'fence' as const
      case 'ui.interactionRoomSelect':
        return 'room' as const
      case 'ui.interactionStableSelect':
        return 'stable' as const
      case 'ui.interactionPlowSelect':
        return 'plow' as const
      case 'ui.interactionSowSelect':
        return 'sow' as const
      default:
        return null
    }
  }

  private isSelectionPromptKey(promptKey?: string) {
    switch (promptKey) {
      case 'ui.interactionSelection':
        return 'farm-position' as const
      case 'ui.interactionOccupationHand':
        return 'occupation-hand' as const
      default:
        return null
    }
  }

  private buildRoomInteraction(
    player: PlayerState,
    costOverride?: Partial<Resource>,
    actionContext?: Record<string, unknown>,
  ): InteractionFarmSelection {
    const idx = this.state.players.indexOf(player)
    return playerBoard(this.state, idx).farmInteraction.selectableTiles('room', {
      costOverride,
      actionContext,
    })
  }

  private readExactCost(actionContext?: Record<string, unknown>): ExactCost | undefined {
    const exactCost = actionContext?.exactCost
    return exactCost && typeof exactCost === 'object' ? exactCost as ExactCost : undefined
  }

  private buildStableInteraction(
    player: PlayerState,
    costOverride?: Partial<Resource>,
    actionContext?: Record<string, unknown>,
  ): InteractionFarmSelection {
    const zoneFilter = actionContext?.zoneFilter
    const max = actionContext?.max
    const idx = this.state.players.indexOf(player)
    return playerBoard(this.state, idx).farmInteraction.selectableTiles('stable', {
      costOverride,
      exactCost: this.readExactCost(actionContext),
      zoneFilter: zoneFilter === 'pasture-1' ? 'pasture-1' : undefined,
      max: typeof max === 'number' ? max : undefined,
    })
  }

  private buildPlowInteraction(
    player: PlayerState,
    costOverride?: Partial<Resource>,
    actionContext?: Record<string, unknown>,
  ): InteractionFarmSelection {
    const idx = this.state.players.indexOf(player)
    return playerBoard(this.state, idx).farmInteraction.selectableTiles('plow', {
      costOverride,
      exactCost: this.readExactCost(actionContext),
    })
  }

  private buildSowInteraction(player: PlayerState): InteractionFarmSelection {
    const actionContext = this.getActionContextFromTopFrame()
    const idx = this.state.players.indexOf(player)
    return playerBoard(this.state, idx).farmInteraction.selectableTiles('sow', { actionContext })
  }

  /**
   * Refactored from `buildFenceInteraction(pending)` to take the current
   * player directly (Task 2: pending metadata is read through the envelope).
   * `selectableTiles('fence', ...)` only needs the active space id (used
   * to detect the `farm-redevelopment` `extraWood` adjustment).
   */
  private buildFenceInteractionFromNode(
    player: PlayerState,
  ): InteractionFarmSelection {
    const frame = this.engineStack.current()
    const idx = this.state.players.indexOf(player)
    return playerBoard(this.state, idx).farmInteraction.selectableTiles('fence', {
      spaceId: frame?.spaceId ?? '',
    })
  }

  private buildSelectionInteractionFromNode(
    player: PlayerState,
  ): InteractionSelection {
    const actionContext = this.getActionContextFromTopFrame()
    const kind = (actionContext?.selectionKind as string | undefined) ?? 'farm-position'
    if (kind === 'occupation-hand') {
      return buildOccupationHandSelectionInteraction(player, actionContext)
    }
    const idx = this.state.players.indexOf(player)
    const interaction = playerBoard(this.state, idx).farmInteraction.selectableTiles('farm-position', { actionContext })
    return this.filterSelectionInteractionByEffectValidator(player, interaction, actionContext)
  }

  private filterSelectionInteractionByEffectValidator(
    player: PlayerState,
    interaction: InteractionSelection,
    actionContext: Record<string, unknown> | undefined,
  ): InteractionSelection {
    if (interaction.kind !== 'farm-position') return interaction
    const effect = actionContext?.selectionEffect
    if (typeof effect !== 'string') return interaction
    const validatePositions = (positions: FarmTilePosition[]) =>
      validateSelectionEffect(effect, {
        player,
        positions: positions.map(positionKey),
        cards: [],
        sourceCard: this.peekPendingSourceCard(),
        state: this.state,
        actionContext,
      })
    if (interaction.validPositionGroups && interaction.validPositionGroups.length > 0) {
      const validPositionGroups = interaction.validPositionGroups.filter((group) =>
        !validatePositions(group),
      )
      const validKeys = new Set(validPositionGroups.flat().map(positionKey))
      return {
        ...interaction,
        selectablePositions: interaction.selectablePositions.filter((pos) =>
          validKeys.has(positionKey(pos)),
        ),
        validPositionGroups,
      }
    }
    return {
      ...interaction,
      selectablePositions: interaction.selectablePositions.filter((pos) =>
        !validatePositions([pos]),
      ),
    }
  }

  private buildFarmInteractionFromNode(
    promptKey: string | undefined,
    player: PlayerState,
  ): InteractionFarmSelection | null {
    const farmType = this.isFarmPromptKey(promptKey)
    if (!farmType) return null
    const ctx = this.getActionContextFromTopFrame()
    const costOverride = this.peekHostContextSnapshot()?.costs
    switch (farmType) {
      case 'fence':
        return this.buildFenceInteractionFromNode(player)
      case 'room':
        return this.buildRoomInteraction(player, costOverride, ctx)
      case 'stable':
        return this.buildStableInteraction(player, costOverride, ctx)
      case 'plow':
        return this.buildPlowInteraction(player, costOverride, ctx)
      case 'sow':
        return this.buildSowInteraction(player)
      default:
        return null
    }
  }

  /**
   * Read-through helper for the pending envelope's context snapshot on the
   * current engine-stack frame. Replaces the previous GameCore pending field's
   * `actionContext` and host-node-specific context readers.
   */
  private getActionContextFromTopFrame(): Record<string, unknown> | undefined {
    return this.peekHostContextSnapshot()?.actionContext
  }

  private cleanupFailedWorkerPlacement(
    frameSpace: ActionSpace,
    player: PlayerState,
    activeActionContext?: Record<string, unknown>,
  ): void {
    const pendingActionContext = this.getActionContextFromTopFrame()
    const targetSpaceId =
      activeActionContext?.targetSpaceId ??
      pendingActionContext?.targetSpaceId
    const targetSpace = typeof targetSpaceId === 'string'
      ? this.getSpaceById(targetSpaceId)
      : null
    const placedWorkerId =
      typeof activeActionContext?.placedWorkerId === 'string'
        ? activeActionContext.placedWorkerId
        : typeof pendingActionContext?.placedWorkerId === 'string'
          ? pendingActionContext.placedWorkerId
          : undefined
    removeWorkerRef(targetSpace ?? frameSpace, player.id, placedWorkerId)
  }

  /**
   * Task 2 — read pending context through PendingEnvelope. The envelope
   * adapter owns pending host lookup.
   */
  private peekHostContextSnapshot(): PendingContextSnapshot | null {
    return pendingContextSnapshot(this.engineStack.peekPendingCursor())
  }

  /**
   * Task 2 — read the pending action id through PendingEnvelope. Returns
   * undefined when no pending envelope or the host did not record an action id.
   */
  private peekHostPendingActionId(): string | undefined {
    return this.engineStack.peekPendingCursor()?.pendingActionId
  }

  private peekPendingSourceCard(): string | undefined {
    const view = this.engineStack.peekPendingView()
    return view?.sourceCard ?? choicesSourceCard(view?.choices ?? [])
  }

  private buildAnytimeEntries(options: { preScoringOnly?: boolean; nestedWindow?: boolean } = {}): { descriptor: AnytimeAction; flow: ActionFlow }[] {
    if (!this.canInterleaveAnytimeAction()) return []
    if (hasPendingOrdinaryCardDrawChoice(this.state)) return []
    const policy = this.computeAnytimePolicySnapshot()
    if (!policy.allowed) return []
    const context = this.getActiveInteractionContext()
    if (!context) return []
    const blockedIds = new Set(policy.blockedIds)
    const { player, space } = context
    const anytimeEntries: { descriptor: AnytimeAction; flow: ActionFlow }[] = []
    const pendingSnapshot = this.peekHostContextSnapshot()
    const pendingSourceCard = this.peekPendingSourceCard()
    const pendingActionContext = pendingSnapshot?.actionContext
    const interactionKind = options.nestedWindow ? 'choice' : this.engineStack.peekPendingView()?.request.kind
    for (const action of options.preScoringOnly ? [] : this.registry.values()) {
      if (!action.anytime) continue
      if (blockedIds.has(action.id)) continue
      if (action.idleOnly && (this.engineStack.depth() > 0 || options.nestedWindow)) continue
      const doable = this.hookDispatcher.applyIsDoable(
        { state: this.state, player, space, actionId: action.id },
        action,
        action.canBeExecutedByPlayer(this.state, player),
      )
      if (!doable) continue
      anytimeEntries.push({
        descriptor: {
          id: action.id,
          labelKey: action.nameKey,
          actionId: action.id,
        },
        flow: { type: 'leaf', actionId: action.id },
      })
    }
    // Card-sourced anytime actions via CardListener phases:['anytime']
    const anytimeContext: import('../cards/card-listeners').CardListenerContextInput = {
      state: this.state,
      player,
      space,
      actionId: 'anytime',
      phase: 'anytime',
      pendingSourceCard,
      actionContext: pendingActionContext,
    }
    const matchedAnytime = getMatchingListeners(anytimeContext)
    for (const entry of matchedAnytime) {
      if (!entry.cardId) continue
      if (entry.ownerPlayerId !== player.id) continue
      if (options.preScoringOnly && entry.registration.preScoring !== true) continue
      if (blockedIds.has(entry.registration.id)) continue
      if (interactionKind && entry.registration.blockedAnytimeInteractionKinds?.includes(interactionKind)) continue
      const result = executeCardListener(entry.registration, anytimeContext, listenerOwnerOptions(entry))
      if (!result?.flow) continue
      // anytime listeners are queried during build (idempotent peek), not
      // fire — do not increment used here. The increment is done when the
      // player actually picks the anytime entry and triggers the flow.
      anytimeEntries.push({
        descriptor: {
          id: entry.registration.id,
          labelKey: result.labelKey ?? `cards.${entry.cardId}.anytime`,
          labelParams: result.labelParams,
          sourceCard: entry.cardId,
        },
        flow: result.flow,
      })
    }

    return anytimeEntries
  }

  private buildAnimalReorgZones(
    player: PlayerState,
  ): InteractionAnimalReorgZone[] {
    const idx = this.state.players.indexOf(player)
    return playerBoard(this.state, idx).animals.zones().map((zone) => ({
      id: zone.id,
      zoneType: zone.zoneType,
      cardId: zone.cardId,
      ...(zone.ownerPlayerId ? { ownerPlayerId: zone.ownerPlayerId } : {}),
      ...(zone.animalOwnerPlayerId ? { animalOwnerPlayerId: zone.animalOwnerPlayerId } : {}),
      ...(zone.displayOwnerName ? { displayOwnerName: zone.displayOwnerName } : {}),
      animalType: zone.animalType ?? null,
      animalCount: zone.animalCount ?? 0,
      ...(zone.animalCounts ? { animalCounts: zone.animalCounts } : {}),
      ...(zone.allowedAnimalType !== undefined ? { allowedAnimalType: zone.allowedAnimalType } : {}),
      ...(zone.zoneType === 'card' ? { allowedAnimalTypes: getAllowedAnimalTypesForZone(this.state, player, zone) } : {}),
      ...(zone.farmPosition ? { farmPosition: zone.farmPosition } : {}),
      ...(zone.countsFarmyardSpaceAsUnused !== undefined ? { countsFarmyardSpaceAsUnused: zone.countsFarmyardSpaceAsUnused } : {}),
      ...(zone.displaySource ? { displaySource: zone.displaySource } : {}),
      ...(zone.exclusiveCardZoneLimit !== undefined ? { exclusiveCardZoneLimit: zone.exclusiveCardZoneLimit } : {}),
      capacity: zone.capacity,
    }))
  }

  private projectPendingInteractionRequest({
    request,
    player,
    promptKey,
    hasPendingHost,
  }: PendingInteractionProjectionInput): InteractionRequest {
    if (request.kind === 'animal-reorg') {
      return {
        ...request,
        zones: player ? this.buildAnimalReorgZones(player) : request.zones,
      }
    }
    if (request.kind !== 'choice' || !hasPendingHost || !player) return request
    if (this.isSelectionPromptKey(promptKey)) {
      return {
        kind: 'selection',
        selection: this.buildSelectionInteractionFromNode(player),
      }
    }
    const farm = this.buildFarmInteractionFromNode(promptKey, player)
    return farm ? { kind: 'farm-select', farm } : request
  }

  private buildInteraction(): InteractionState {
    return deriveInteractionState({
      state: this.state,
      engineStack: this.engineStack,
      getAnytimeEntries: () => this.buildAnytimeEntries(),
      getAnytimePolicy: () => this.computeAnytimePolicySnapshot(),
      filterUndoCommands: (commands) => this.filterUndoCommands(commands),
      winnerIds: () => this.computeWinnerIds(),
      scoreSummary: () => this.computeScoreSummary(),
      effectiveOwnerIndexForFrame: (frame, nodeId, pending) =>
        this.effectiveOwnerIndexForFrame(frame, nodeId, pending),
      projectPendingRequest: (input) => this.projectPendingInteractionRequest(input),
    })
  }

  private computeWinnerIds(): string[] {
    const summary = Scoring.computeAll(this.state)
    if (summary.length === 0) return []
    const top = summary.reduce((a, b) => (a.total >= b.total ? a : b))
    return summary.filter((s) => s.total === top.total).map((s) => s.playerId)
  }

  private computeScoreSummary() {
    return Scoring.computeAll(this.state).map((s) => ({ playerId: s.playerId, total: s.total }))
  }

  private respond(
    ok = true,
    error?: string,
    privateEvents?: PrivateGameEvent[],
    metadata: ResponseMetadata = {},
  ): SessionResponse {
    // While the top-level game phase is 'draft', the client uses
    // DraftOverlay (which reads `state.draft` directly), so surface an
    // idle interaction. Otherwise let `buildInteraction()` derive the
    // wait/idle/gameover shape from the engine stack.
    const isDrafting = this.state.phase === 'draft' && this.state.draft != null
    const isParentSelecting = this.state.phase === 'parent-selection' && this.state.parentSelection != null
    const interaction: InteractionState = isDrafting || isParentSelecting
      ? { stateId: 'idle', allowedCommands: [], anytimeActions: [] }
      : this.buildInteraction()
    const resp: SessionResponse = {
      ok,
      state: this.state,
      interaction,
      historyLength: this.canUndoStepNow() ? this.history.length : 0,
      hasActionStartSnapshot: this.canUndoActionNow(),
      scores: Scoring.computeAll(this.state),
      pastureCapacities: this.getPastureCapacities(),
    }
    // Include backend-computed availability for the current player when
    // they're free to act (idle interaction, not gameover, not drafting).
    if (!this.state.gameOver && interaction.stateId === 'idle' && !isDrafting && !isParentSelecting) {
      const actionAvailability = this.getActionAvailability(this.state.currentPlayerIndex)
      resp.actionAvailability = actionAvailability
      resp.cardAvailability = this.getCardAvailability(
        this.state.currentPlayerIndex,
        actionAvailability,
      )
    }
    if (error) resp.error = error
    const drainedPrivateEvents = this.drainResponsePrivateEvents(ok, privateEvents)
    if (drainedPrivateEvents) resp.privateEvents = drainedPrivateEvents
    if (metadata.publicEventCancellations?.length) {
      resp.publicEventCancellations = metadata.publicEventCancellations
    }
    return resp
  }

  private maxPublicEventSeq(events: GameState['events']): number {
    if (events.length === 0) return 0
    return events.reduce((max, event) => Math.max(max, event.seq), 0)
  }

  private capturePublicEventArchive(): PublicEventArchiveSnapshot {
    assertPublicEventArchiveCanAppend(this.state)
    return {
      publicEventArchive: JSON.parse(JSON.stringify(this.state.publicEventArchive ?? [])) as GameState['publicEventArchive'],
      nextPublicEventArchivePacketSeq: this.state.nextPublicEventArchivePacketSeq ?? 1,
    }
  }

  private restorePublicEventArchive(snapshot: PublicEventArchiveSnapshot): void {
    this.state.publicEventArchive = JSON.parse(JSON.stringify(snapshot.publicEventArchive)) as GameState['publicEventArchive']
    this.state.nextPublicEventArchivePacketSeq = snapshot.nextPublicEventArchivePacketSeq
  }

  private buildPublicEventCancellation(
    reason: PublicEventCancellation['reason'],
    beforeEvents: GameState['events'],
    afterEvents: GameState['events'] = this.state.events,
  ): { cancellation: PublicEventCancellation; canceledEvents: GameState['events'] } | null {
    const previousMaxSeq = this.maxPublicEventSeq(beforeEvents)
    const nextMaxSeq = this.maxPublicEventSeq(afterEvents)
    const afterIds = new Set(afterEvents.map((event) => event.id))
    const canceledEvents = beforeEvents.filter((event) =>
      event.seq > nextMaxSeq || !afterIds.has(event.id)
    ).sort((a, b) => a.seq - b.seq)
    if (canceledEvents.length === 0) return null
    const cancellation = {
      reason,
      previousMaxSeq,
      nextMaxSeq,
      canceledEventIds: canceledEvents.map((event) => event.id),
      canceledSeqs: canceledEvents.map((event) => event.seq),
    }
    return { cancellation, canceledEvents }
  }

  private preparePublicEventCancellation(
    reason: PublicEventCancellation['reason'],
    beforeEvents: GameState['events'],
    afterEvents: GameState['events'],
    archiveBeforeAppend: PublicEventArchiveSnapshot,
  ): PublicEventCancellationPlan {
    const result = this.buildPublicEventCancellation(reason, beforeEvents, afterEvents)
    if (!result) return {}
    const archiveState = {
      ...this.state,
      publicEventArchive: JSON.parse(JSON.stringify(archiveBeforeAppend.publicEventArchive)) as GameState['publicEventArchive'],
      nextPublicEventArchivePacketSeq: archiveBeforeAppend.nextPublicEventArchivePacketSeq,
    } as GameState
    try {
      appendPublicEventCanceledPacket(archiveState, {
        ...result.cancellation,
        canceledEvents: result.canceledEvents,
      })
    } catch (error) {
      if (error instanceof PublicEventArchivePayloadError) {
        return { publicEventCancellations: [result.cancellation] }
      }
      throw error
    }
    return {
      publicEventCancellations: [result.cancellation],
      archiveAfterAppend: {
        publicEventArchive: archiveState.publicEventArchive,
        nextPublicEventArchivePacketSeq: archiveState.nextPublicEventArchivePacketSeq,
      },
    }
  }

  private applyPreparedPublicEventCancellation(
    archiveBeforeAppend: PublicEventArchiveSnapshot,
    plan: PublicEventCancellationPlan,
  ): SessionResponse {
    this.restorePublicEventArchive(plan.archiveAfterAppend ?? archiveBeforeAppend)
    return this.respond(true, undefined, undefined, plan.publicEventCancellations
      ? { publicEventCancellations: plan.publicEventCancellations }
      : {})
  }

  private drainResponsePrivateEvents(
    ok: boolean,
    explicit?: PrivateGameEvent[],
  ): PrivateGameEvent[] | undefined {
    if (this.deferPrivateEventDrainDepth > 0 && !explicit) return undefined
    const buffered = this.responsePrivateEvents.splice(0)
    if (!ok) return undefined
    const events = [...(explicit ?? []), ...buffered]
    return events.length > 0 ? events : undefined
  }

  private buildEngineExecutionContext(player: PlayerState, space: ActionSpace) {
    return {
      state: this.state,
      player,
      space,
      emitPrivateEvent: (event: PrivateGameEvent) => this.emitResponsePrivateEvent(event),
      reportProtectedObservation: (observation: ProtectedObservation) =>
        this.reportProtectedObservation(observation),
    }
  }

  /**
   * Whether the current engine-stack state is an engine choice — i.e. the
   * top-of-stack pending envelope has a `choice` / `animal-reorg` /
   * `farm-select` / `selection` request, OR a composite pending
   * choice from a composite choice node or an optional metadata host. Used by `pushHistory()`
   * to populate `HistoryEntry.hadChoicePending`, which `undoStep()`
   * consults via the `canRestorePriorChoice` branch.
   */
  private currentIsChoicePending(): boolean {
    const frame = this.engineStack.current()
    if (!frame) return false
    const kind = this.engineStack.peekPendingView()?.request.kind
    return kind === 'choice'
      || kind === 'animal-reorg'
      || kind === 'farm-select'
      || kind === 'selection'
  }

  private pushHistory(actionStart = false, undoBoundary = false) {
    // Cards can flag a one-shot undo boundary on state via `state.pendingUndoBoundary`
    // (e.g. immediately after rolling random). Merge it with the explicit parameter,
    // then clear the flag so it fires exactly once.
    const effectiveBoundary = undoBoundary || this.state.pendingUndoBoundary === true
    if (this.state.pendingUndoBoundary) {
      this.state.pendingUndoBoundary = false
    }
    const frame = this.engineStack.current()
    const entry: HistoryEntry = {
      state: cloneState(this.state),
      // Task 10/11: the previous GameCore pending field is gone; derive the
      // snapshot from the pending envelope. S2 Task 13.6 contracted the
      // HistoryEntry pending snapshot down to a single boolean — `undoStep()`
      // only consults the 'choice' discriminator (see `canRestorePriorChoice`).
      hadChoicePending: this.currentIsChoicePending(),
      activeSpaceId: this.activeSpaceId,
      activePlayerIndex: this.activePlayerIndex,
      engineSnapshot: this.engine?.snapshot() ?? null,
      engineSource: this.engineSource
        ? JSON.parse(JSON.stringify(this.engineSource)) as EngineSource
        : null,
      stageResume: this.stageResume ? { ...this.stageResume } : null,
      deferredPlayerSwitch: frame?.deferredPlayerSwitch
        ? { ...frame.deferredPlayerSwitch }
        : null,
      turnOwnerPlayerIndex: this.turnOwnerPlayerIndex,
      actionStart,
      undoBoundary: effectiveBoundary,
    }
    this.history.push(entry)
    if (actionStart) {
      this.actionStartIndex = this.history.length - 1
    }
  }

  private restoreHistory(entry: HistoryEntry) {
    this.state = cloneState(entry.state)
    // Task 10/11: the previous GameCore pending field was deleted from
    // `GameState`. S2 Task 13.6 collapsed the HistoryEntry pending snapshot to a single boolean
    // (`hadChoicePending`) consumed by `undoStep()`'s `canRestorePriorChoice`
    // branch. Live pending/interaction shape is rederived from
    // the pending envelope after the stack is restored below.
    this.turnOwnerPlayerIndex = entry.turnOwnerPlayerIndex
    this.engineStack.clear()
    const source = entry.engineSource
      ? JSON.parse(JSON.stringify(entry.engineSource)) as EngineSource
      : null
    // pushHistory invariant: when there's a live frame on the stack, all of
    // (engineSource, activeSpaceId, activePlayerIndex) come off the same
    // frame and are non-null together; when the stack is empty, all three
    // are null. So `source` is a sufficient gate — the previous extra
    // null-checks on activeSpaceId/activePlayerIndex were defensive but
    // redundant. Use a non-null assertion on the two synced fields.
    if (source) {
      const engine = this.createEngineFromSource(source, entry.activePlayerIndex!)
      if (entry.engineSnapshot) {
        engine.restore(entry.engineSnapshot)
      }
      this.engineStack.push({
        engine,
        source,
        ownerPlayerIndex: entry.activePlayerIndex!,
        spaceId: entry.activeSpaceId!,
        stageResume: entry.stageResume ? { ...entry.stageResume } : null,
        deferredPlayerSwitch: entry.deferredPlayerSwitch
          ? { ...entry.deferredPlayerSwitch }
          : null,
        // Restore-from-history frames default to 'top-level' because the
        // HistoryEntry schema does not persist a sub-flow `reason`. Cursor-
        // based serialize/rehydrate (Task 8) round-trips reason through
        // `EngineFrameCursor.reason`; the in-memory undo path is independent
        // and only ever rebuilds top-level frames here. See
        // `docs/sprint-S1-spec.md` D-a for the persisted form.
        reason: 'top-level',
      })
    }
  }

  private restorePendingExtraTurnAfterUndo(): void {
    if (this.engineStack.depth() > 0) return
    roundPhase.startPendingExtraTurnIfAny(this)
  }

  private recomputeActionStartIndex() {
    for (let i = this.history.length - 1; i >= 0; i -= 1) {
      if (this.history[i]?.actionStart) {
        this.actionStartIndex = i
        return
      }
    }
    this.actionStartIndex = null
  }

  private latestUndoBoundaryIndex(): number {
    for (let i = this.history.length - 1; i >= 0; i -= 1) {
      if (this.history[i]?.undoBoundary) return i
    }
    return -1
  }

  private canUndoStepNow(): boolean {
    if (this.state.pendingUndoBoundary === true) return false
    const entry = this.history[this.history.length - 1]
    return !!entry && entry.undoBoundary !== true
  }

  private canUndoActionNow(): boolean {
    if (this.state.pendingUndoBoundary === true) return false
    if (this.actionStartIndex === null) return false
    return this.actionStartIndex > this.latestUndoBoundaryIndex()
  }

  private filterUndoCommands(base: ReadonlyArray<InteractionCommand>): InteractionCommand[] {
    const canUndoStep = this.canUndoStepNow()
    const canUndoAction = this.canUndoActionNow()
    return base.filter((command) =>
      (command !== 'undoStep' || canUndoStep) &&
      (command !== 'undoAction' || canUndoAction),
    )
  }

  private buildRoundSnapshot(state: GameState): GameState {
    const snapshot = cloneState(state)
    // workers return home at round start — just clear action space occupancy.
    snapshot.actionSpaces.forEach((space) => { space.takenBy = [] })
    clearAllLinkedSpaceBlocks(snapshot)
    snapshot.roundStartSnapshot = null
    return snapshot
  }

  private buildActionDetailParts(before: PlayerState, player: PlayerState) {
    const gains: Resource = { ...emptyResources }
    const costs: Resource = { ...emptyResources }
    const effects: NonNullable<ActionDetailParts['effects']> = {}
    const bonusSources = player._activeActionBonusSources
      ? [...player._activeActionBonusSources]
      : undefined
    if (player.rooms > before.rooms) {
      effects.buildRoom = player.rooms - before.rooms
    }
    const beforeSize = familySize(before)
    const afterSize = familySize(player)
    if (afterSize > beforeSize) {
      effects.growFamily = afterSize - beforeSize
    }
    if (player.fields.length > before.fields.length) {
      effects.plow = player.fields.length - before.fields.length
    }
    let sowGrain = 0
    let sowVegetable = 0
    const beforeFieldMap = new Map(
      before.fields.map((field) => [positionKey({ row: field.row, col: field.col }), field]),
    )
    player.fields.forEach((field) => {
      const beforeField = beforeFieldMap.get(
        positionKey({ row: field.row, col: field.col }),
      )
      if (beforeField && beforeField.stacks.length > 0) return
      const top = field.stacks[field.stacks.length - 1]
      if (top?.kind === 'grain') sowGrain += 1
      if (top?.kind === 'vegetable') sowVegetable += 1
    })
    if (sowGrain > 0) effects.sowGrain = sowGrain
    if (sowVegetable > 0) effects.sowVegetable = sowVegetable
    if (player.houseType !== before.houseType) {
      effects.renovate = { from: before.houseType, to: player.houseType }
    }
    const fenceDelta = getFenceCount(player) - getFenceCount(before)
    const palisadeDelta = getPalisadeCount(player) - getPalisadeCount(before)
    if (fenceDelta > 0) effects.fencing = fenceDelta
    if (palisadeDelta > 0) effects.palisading = palisadeDelta
    const stablesBefore = before.stableTiles?.length ?? 0
    const stablesAfter = player.stableTiles?.length ?? 0
    if (stablesAfter > stablesBefore) {
      effects.buildStables = stablesAfter - stablesBefore
    }
    const newImprovements = player.improvements.filter(
      (id) => !before.improvements.includes(id),
    )
    if (newImprovements.length > 0) {
      effects.improvements = newImprovements
    }
    const newMinorImprovements = player.minorPlayed.filter(
      (id) => !before.minorPlayed.includes(id),
    )
    if (newMinorImprovements.length > 0) {
      effects.minorImprovements = newMinorImprovements
    }
    if (!before.startPlayer && player.startPlayer) {
      effects.startPlayer = true
    }
    const bakedGrain = costs.grain ?? 0
    const bakedFood = gains.food ?? 0
    if (bakedGrain > 0 && bakedFood > 0) {
      effects.bakeBread = { count: bakedGrain, food: bakedFood }
    }
    const result = { gains, costs, effects } as ActionDetailParts & {
      gains: Resource
      costs: Resource
      effects: NonNullable<ActionDetailParts['effects']>
    }
    if (bonusSources && bonusSources.length > 0) {
      result.bonusSources = bonusSources
    }
    return result
  }

  private addPositiveResourceDetails(
    bucket: 'gains' | 'costs',
    resources: Partial<Resource> | undefined,
  ) {
    if (!resources) return
    const target = this.actionResultDetailsSinceFlush[bucket]
    for (const key of resourceKeyList) {
      const amount = resources[key] ?? 0
      if (amount > 0) target[key] = (target[key] ?? 0) + amount
    }
  }

  private recordActionResultDetails(
    result: ActionExecutionResult,
    detailPlayerId?: string,
    defaultPlayerId?: string,
    sourceCard?: string,
  ) {
    if (result.type !== 'ok') return
    if (isInjectedAnytimeResult(result)) return
    const deltas = actionDetailResourceDeltas(result)
    if (deltas.length > 0) {
      for (const delta of deltas) {
        if (!detailPlayerId || delta.playerId !== detailPlayerId) continue
        this.addPositiveResourceDetails('gains', delta.gains)
        this.addPositiveResourceDetails('costs', delta.costs)
      }
      return
    }
    if (sourceCard) return
    if (detailPlayerId && defaultPlayerId && detailPlayerId !== defaultPlayerId) return
    this.addPositiveResourceDetails('gains', result.resourcesGained)
    this.addPositiveResourceDetails('costs', result.resourcesPaid)
  }

  private consumeActionResultDetails(detailParts: ActionDetailParts & {
    gains: Resource
    costs: Resource
  }) {
    for (const key of resourceKeyList) {
      detailParts.gains[key] = this.actionResultDetailsSinceFlush.gains[key] ?? 0
      detailParts.costs[key] = this.actionResultDetailsSinceFlush.costs[key] ?? 0
    }
    this.resetActionResultDetails()
  }

  private hasEventDerivedActionDetail(playerId: string, actionId: string): boolean {
    const latestPlacement = [...this.state.events]
      .filter((event) =>
        event.type === 'worker.placed' &&
        event.actorPlayerId === playerId &&
        (event.sourceActionId === actionId || event.spaceId === actionId),
      )
      .sort((left, right) => right.seq - left.seq)[0]
    const latestPlacementSeq = latestPlacement?.seq ?? -1
    return this.state.events.some((event) => {
      if (event.seq <= latestPlacementSeq) return false
      switch (event.type) {
        case 'resource.moved':
          if (event.actorPlayerId !== playerId || event.to.kind !== 'player') return false
          if (event.reason === 'harvest' || event.reason === 'cardEffect') return false
          if (!resourceKeyList.some((key) => (event.resources[key] ?? 0) > 0)) return false
          return event.sourceActionId === actionId ||
            (event.from.kind === 'actionSpace' && event.from.spaceId === actionId)
        case 'farm.fieldPlowed':
          return event.actorPlayerId === playerId && (event.sourceActionId ?? 'plow') === actionId
        case 'farm.roomBuilt':
          return event.actorPlayerId === playerId && (event.sourceActionId ?? 'construct') === actionId
        case 'farm.renovated':
          return (event.actorPlayerId ?? event.playerId) === playerId &&
            (event.sourceActionId ?? 'renovate-house') === actionId
        case 'farm.stableBuilt':
          return event.actorPlayerId === playerId &&
            ((event.sourceActionId ?? latestPlacement?.sourceActionId ?? 'stables') === actionId)
        case 'farm.fenceBuilt':
          return event.actorPlayerId === playerId && (event.sourceActionId ?? 'fence') === actionId
        case 'resource.exchanged':
          if (event.actorPlayerId !== playerId) return false
          if ((event.paid.grain ?? 0) > 0 && (event.gained.food ?? 0) > 0 && event.exchangeSource) return false
          return (event.sourceActionId ?? event.exchangeSource ?? 'exchange') === actionId
        case 'resource.paid':
          if (event.actorPlayerId !== playerId) return false
          if (event.paymentFor === 'feeding' || event.paymentFor === 'begging' || event.sourceCardId) return false
          return (event.sourceActionId ?? event.paymentFor) === actionId
        default:
          return false
      }
    })
  }

  private emitActionDetailLoggedEvent(
    player: PlayerState,
    actionId: string,
    detailParts: ActionDetailParts & {
      gains: Resource
      costs: Resource
      effects: NonNullable<ActionDetailParts['effects']>
    },
  ): void {
    if (this.hasEventDerivedActionDetail(player.id, actionId)) return
    const compact = compactActionDetailParts(detailParts)
    if (Object.keys(compact).length === 0) return
    appendImmediateEvents(this.state, [{
      type: 'action.detailLogged',
      playerId: player.id,
      actionId,
      detailParts: compact,
      actorPlayerId: player.id,
      sourceActionId: actionId,
    }])
  }

  private logActionDetail(before: PlayerState, player: PlayerState) {
    if (!this.activeSpaceId) return
    const space = this.getSpaceById(this.activeSpaceId)
    if (!space) return
    const detailParts = this.buildActionDetailParts(before, player)
    this.consumeActionResultDetails(detailParts)
    const hasGains = resourceKeyList.some((key) => (detailParts.gains[key] ?? 0) > 0)
    const hasCosts = resourceKeyList.some((key) => (detailParts.costs[key] ?? 0) > 0)
    const hasEffects = Object.keys(detailParts.effects ?? {}).length > 0
    if (
      detailParts.effects?.improvements
      || detailParts.effects?.minorImprovements
      || detailParts.effects?.bakeBread
    ) return
    if (!hasGains && !hasCosts && !hasEffects) return
    void space
    this.emitActionDetailLoggedEvent(player, this.activeSpaceId, detailParts)
    player._activeActionBonusSources = []
    this.actionStartPlayerSnapshot = this.clonePlayer(player)
  }

  /**
   * Mid-flow flush: when a leaf action node inside a SEQ/optional flow finishes,
   * emit a partial `log.actionDetail` for that sub-action and advance the
   * baseline snapshot. Subsequent leaves and the final aggregate then only see
   * the remaining state changes, avoiding duplicate logs.
   *
   * Skipped when:
   *   - no active snapshot (no in-flight action),
   *   - leaf actionId equals the top-level activeSpaceId (the wrapper itself),
   *   - the resulting change is already covered by a dedicated event-derived
   *     log (for example improvement / bake-bread).
   */
  private flushLeafActionDetail(
    actionId: string | undefined,
    hasOwnLogKey: boolean,
  ) {
    if (!actionId) return
    if (!this.actionStartPlayerSnapshot) return
    if (this.activePlayerIndex === null) return
    if (actionId === this.activeSpaceId) return
    if (hasOwnLogKey) return
    const def = getActionDefinition(actionId)
    if (!def?.emitLeafActionDetail) return
    const player = this.state.players[this.activePlayerIndex]
    if (!player) return
    const before = this.actionStartPlayerSnapshot
    const detailParts = this.buildActionDetailParts(before, player)
    this.consumeActionResultDetails(detailParts)
    const hasGains = resourceKeyList.some((key) => (detailParts.gains[key] ?? 0) > 0)
    const hasCosts = resourceKeyList.some((key) => (detailParts.costs[key] ?? 0) > 0)
    const hasEffects = Object.keys(detailParts.effects ?? {}).length > 0
    if (
      detailParts.effects?.improvements
      || detailParts.effects?.minorImprovements
      || detailParts.effects?.bakeBread
    ) {
      this.actionStartPlayerSnapshot = this.clonePlayer(player)
      return
    }
    if (!hasGains && !hasCosts && !hasEffects) {
      player._activeActionBonusSources = []
      this.actionStartPlayerSnapshot = this.clonePlayer(player)
      return
    }
    const frame = this.engineStack.current()
    const space = frame?.spaceId ? this.getSpaceById(frame.spaceId) : undefined
    if (frame && space) {
      frame.engine.flushEventTransaction({ state: this.state, player, space })
      this.flushEngineLog()
    }
    player._activeActionBonusSources = []
    this.actionStartPlayerSnapshot = this.clonePlayer(player)
  }

  private flushEngineLog() {
    const entries = this.engineLog.all()
    if (entries.length > 0) {
      const toAdd = entries.filter((e) => e.key !== 'log.action')
      prependDerivedLogEntries(this.state, toAdd)
      this.engineLog.clear()
    }
  }

  /** S2 Task 10 part 6: thin delegator — body lives in `phases/round.ts`. */
  private finalizeActionLog(player: PlayerState) { return roundPhase.finalizeActionLog(this, player) }

  private buildFutureMeepleReceiveFlow() {
    const receiveEntriesByPlayer = new Map<string, Array<{
      cardId: string
      round: number
      resources: Partial<Resource>
    }>>()
    for (const entry of this.state.futureMeeples) {
      if (entry.round !== this.state.round) continue
      const playerIndex = findPlayerIndexById(this.state, entry.playerId)
      if (playerIndex === -1) continue
      const receiveResources: Partial<Resource> = {}
      if (this.futureMeepleResourceConditionMet(entry)) {
        for (const key of extendedResourceKeyList) {
          const amount = entry.resources[key] ?? 0
          if (amount > 0) receiveResources[key] = amount
        }
      }
      if (Object.keys(receiveResources).length > 0) {
        const receiveEntries = receiveEntriesByPlayer.get(entry.playerId) ?? []
        receiveEntries.push({
          cardId: entry.cardId,
          round: entry.round,
          resources: receiveResources,
        })
        receiveEntriesByPlayer.set(entry.playerId, receiveEntries)
      }
    }
    const children: ActionFlow[] = []
    let firstPlayerIndex = -1
    for (const [playerId, entries] of receiveEntriesByPlayer) {
      const playerIndex = findPlayerIndexById(this.state, playerId)
      if (playerIndex === -1) continue
      if (firstPlayerIndex === -1) firstPlayerIndex = playerIndex
      children.push({
        type: 'leaf',
        actionId: 'receive',
        targetPlayerId: playerId,
        params: { entries },
      })
    }
    if (children.length === 0 || firstPlayerIndex === -1) return null
    return {
      flow: children.length === 1 ? children[0]! : { type: 'seq', children } as ActionFlow,
      playerIndex: firstPlayerIndex,
    }
  }

  private buildFutureMeepleActionFlow() {
    const children: ActionFlow[] = []
    let firstPlayerIndex = -1
    for (const entry of this.state.futureMeeples) {
      if (entry.round !== this.state.round) continue
      const playerIndex = findPlayerIndexById(this.state, entry.playerId)
      if (playerIndex === -1) continue
      const player = this.state.players[playerIndex]!
      const actionContext = entry.actionContext ?? {}
      for (let i = 0; i < futureMeepleActionCount(entry, 'field'); i += 1) {
        if (firstPlayerIndex === -1) firstPlayerIndex = playerIndex
        children.push({
          type: 'seq',
          optional: true,
          children: [{
            type: 'leaf',
            actionId: 'plow',
            sourceCard: entry.cardId,
            targetPlayerId: entry.playerId,
            actionContext: { ...actionContext, trueAction: false },
          }],
        })
      }
      for (let i = 0; i < futureMeepleActionCount(entry, 'stable'); i += 1) {
        if (firstPlayerIndex === -1) firstPlayerIndex = playerIndex
        children.push({
          type: 'seq',
          optional: true,
          children: [{
            type: 'leaf',
            actionId: 'stables',
            sourceCard: entry.cardId,
            targetPlayerId: entry.playerId,
            actionContext: { max: 1, exactCost: { max: 1 }, ...actionContext, trueAction: false },
          }],
        })
      }
      for (const kind of ['forest', 'moor'] as const) {
        for (let i = 0; i < futureMeepleActionCount(entry, kind); i += 1) {
          const flow = buildPlaceTerrainFlow(entry.cardId, player, kind)
          if (!flow) continue
          if (firstPlayerIndex === -1) firstPlayerIndex = playerIndex
          children.push({
            type: 'seq',
            optional: true,
            targetPlayerId: entry.playerId,
            children: [flow],
          })
        }
      }
    }
    if (children.length === 0 || firstPlayerIndex === -1) return null
    return {
      flow: children.length === 1 ? children[0]! : { type: 'seq', children } as ActionFlow,
      playerIndex: firstPlayerIndex,
    }
  }

  private futureMeepleResourceConditionMet(entry: GameState['futureMeeples'][number]): boolean {
    const condition = entry.actionContext?.resourceCondition
    if (!condition || typeof condition !== 'object' || Array.isArray(condition)) return true
    const raw = condition as { kind?: unknown; resource?: unknown; amount?: unknown }
    if (raw.kind !== 'min-resource') return true
    if (typeof raw.resource !== 'string') return true
    const resource = raw.resource as keyof Resource
    if (!resourceKeyList.includes(resource) && resource !== 'horse' && resource !== 'fuel') return true
    if (typeof raw.amount !== 'number' || !Number.isFinite(raw.amount)) return true
    const player = findPlayerById(this.state, entry.playerId)
    if (!player) return false
    return (player.resources[resource] ?? 0) >= Math.max(0, Math.floor(raw.amount))
  }

  private buildFutureMeepleResolvedEvents(): ImmediateEventDraft[] {
    return this.state.futureMeeples
      .filter((entry) =>
        entry.round === this.state.round &&
        hasPlayer(this.state, entry.playerId),
      )
      .map((entry) => {
        const resources = this.futureMeepleResourceConditionMet(entry) ? entry.resources : {}
        return {
          type: 'futureMeeple.resolved',
          playerId: entry.playerId,
          cardId: entry.cardId,
          sourceCardId: entry.cardId,
          round: entry.round,
          ...(Object.keys(resources ?? {}).length > 0 ? { resources } : {}),
          ...(entry.roomType ? { roomType: entry.roomType } : {}),
        } as ImmediateEventDraft
      })
  }

  /** S2 Task 10 part 6: thin delegator — body lives in `phases/round.ts`. */
  private finishCompletedActionTurn(playerIndex: number): SessionResponse {
    return roundPhase.finishCompletedActionTurn(this, playerIndex)
  }

  private endTurnTriggerActionId(frame: EngineFrame): string | null {
    return frame.source.kind === 'action' ? 'place-farmer' : null
  }

  private continueEndTurnHooks(
    playerIndex: number,
    cardIndex = 0,
    triggerActionId?: string | null,
  ): SessionResponse {
    const extra = triggerActionId ? { triggerActionId } : undefined
    if (this.stageDispatch.continueSinglePlayerStageHook('onEndTurn', playerIndex, cardIndex, extra)) {
      return this.respond()
    }
    return this.finishCompletedActionTurn(playerIndex)
  }

  private continueHarvestFromBeforeHarvest(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.stageDispatch.continueStageHook('onBeforeHarvest', playerIndex, cardIndex)) {
      return this.respond()
    }
    activatePendingHarvestSkips(this.state)
    return this.continueHarvestPrepWindow()
  }

  private continueHarvestPrepWindow(playerIndex = 0): SessionResponse {
    for (let currentPlayerIndex = playerIndex; currentPlayerIndex < this.state.players.length; currentPlayerIndex += 1) {
      const player = this.state.players[currentPlayerIndex]
      if (!player) continue
      if (isPlayerSkippingCurrentHarvest(this.state, player)) continue
      const flow = this.buildHarvestPrepFlow(player)
      if (!flow) continue
      this.stageDispatch.startFlow(
        flow,
        'harvestPrepWindow',
        currentPlayerIndex,
        0,
        currentPlayerIndex + 1,
      )
      return this.respond()
    }
    return this.continueFromStartHarvest()
  }

  private continueFromStartHarvest(playerIndex = 0, cardIndex = 0, extra?: StageResumeState['extra']): SessionResponse {
    if (this.stageDispatch.continueStageHook('onStartHarvest', playerIndex, cardIndex, extra)) {
      return this.respond()
    }
    return this.continueHarvestFieldStart()
  }

  private continueHarvestFieldStart(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (playerIndex === 0 && cardIndex === 0) {
      this.state.roundPhase = 'field'
      appendImmediateEvents(this.state, [{
        type: 'harvest.phaseStarted',
        harvestPhase: 'field',
      }])
      this.state.harvestReapSummary = {}
      const harvestOrder = this.getHarvestPlayerIndices()
      harvestOrder.forEach((index) => {
        const player = this.state.players[index]
        if (!player) return
        if (this.hasPassFieldAndBreed(player)) return
        this.state.harvestReapSummary![player.id] = {
          resources: {},
          grainFields: 0,
          vegetableFields: 0,
          harvestedCrops: [],
          harvestCountApplications: [],
          harvestedPositions: [],
        }
      })
    }
    if (this.stageDispatch.continueStageHook('onStartHarvestFieldPhase', playerIndex, cardIndex)) {
      return this.respond()
    }
    return this.continueHarvestFieldPhase()
  }

  private continueHarvestFieldPhase(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.stageDispatch.continueStageHook('onHarvestFieldPhase', playerIndex, cardIndex)) {
      return this.respond()
    }
    return this.continueHarvestReap()
  }

  private continueHarvestReap(): SessionResponse {
    const harvestOrder = this.getHarvestPlayerIndices()
    const reactionChildren: ActionFlow[] = []
    const appendReactionFlow = (flow: ActionFlow | undefined) => {
      if (!flow) return
      if (flow.type === 'parallel') {
        reactionChildren.push(...flow.children)
        return
      }
      reactionChildren.push(flow)
    }
    harvestOrder.forEach((index) => {
      const player = this.state.players[index]
      if (!player) return
      // E58 LunchtimeBeer (and any future card) may flag a player to skip
      // the field phase of the current harvest. Flagged players are not reaped.
      if (this.hasPassFieldAndBreed(player)) {
        appendImmediateEvents(this.state, [{ type: 'harvest.reapSkipped', playerId: player.id }], {
          actorPlayerId: player.id,
        })
        return
      }
      const reapEvents: DraftGameEvent[] = []
      const result = reap(this.state, player, captureEventSink(reapEvents))
      appendImmediateEvents(this.state, reapEvents, {
        actorPlayerId: player.id,
        sourceActionId: 'reap',
      })
      appendReactionFlow(result.reactionFlow)
      const entry = this.state.harvestReapSummary![player.id]!
      entry.grainFields += result.reapSummary.grainFields
      entry.vegetableFields += result.reapSummary.vegetableFields
      for (const [crop, amount] of Object.entries(result.reapSummary.resources)) {
        const cropKey = crop as keyof typeof entry.resources
        entry.resources[cropKey] = (entry.resources[cropKey] ?? 0) + (amount ?? 0)
      }
      if (result.reapSummary.harvestedPositions?.length) {
        entry.harvestedPositions = [
          ...(entry.harvestedPositions ?? []),
          ...result.reapSummary.harvestedPositions,
        ]
      }
      if (result.reapSummary.harvestedCrops?.length) {
        entry.harvestedCrops = [
          ...(entry.harvestedCrops ?? []),
          ...result.reapSummary.harvestedCrops,
        ]
      }
      if (result.reapSummary.harvestCountApplications?.length) {
        entry.harvestCountApplications = [
          ...(entry.harvestCountApplications ?? []),
          ...result.reapSummary.harvestCountApplications,
        ]
      }
      incHarvestedGrain(player, result.reapSummary.resources.grain ?? 0)
      incHarvestedVegetable(player, result.reapSummary.resources.vegetable ?? 0)
      if (!this.hasPositiveResources(entry.resources)) {
        appendImmediateEvents(this.state, [{ type: 'harvest.reapNothing', playerId: player.id }], {
          actorPlayerId: player.id,
        })
      }
    })
    if (reactionChildren.length > 0) {
      this.stageDispatch.startFlow({ type: 'parallel', children: reactionChildren }, 'afterHarvestReapReaction', 0, 0)
      return this.respond()
    }
    return this.continueAfterReapEffects()
  }

  private continueAfterReapEffects(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.stageDispatch.continueStageHook('onAfterReap', playerIndex, cardIndex)) {
      return this.respond()
    }
    return this.continueEndFieldPhase()
  }

  private continueEndFieldPhase(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.stageDispatch.continueStageHook('onEndHarvestFieldPhase', playerIndex, cardIndex)) {
      return this.respond()
    }
    this.state.roundPhase = 'harvest'
    return this.continueHarvestEffects()
  }

  private continueHarvestEffects(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.stageDispatch.continueStageHook('onHarvest', playerIndex, cardIndex)) {
      return this.respond()
    }

    return this.continuePostReapAnytimeWindow()
  }

  private continuePostReapAnytimeWindow(afterPlayerIndex?: number): SessionResponse {
    const harvestOrder = this.getHarvestPlayerIndices()
    const start = afterPlayerIndex === undefined
      ? 0
      : harvestOrder.indexOf(afterPlayerIndex) + 1
    for (let offset = Math.max(0, start); offset < harvestOrder.length; offset += 1) {
      const playerIndex = harvestOrder[offset]!
      this.startPostReapAnytimeSubFlow(playerIndex)
      if (this.buildAnytimeEntries().length > 0) return this.respond()
      this.engineStack.pop()
    }
    return this.startHarvestFeedingPhase()
  }

  private startHarvestFeedingPhase(): SessionResponse {
    this.state.roundPhase = 'feeding'
    appendImmediateEvents(this.state, [{
      type: 'harvest.phaseStarted',
      harvestPhase: 'feeding',
    }])
    return this.continueStartHarvestFeedingPhase()
  }

  private continueStartHarvestFeedingPhase(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.stageDispatch.continueStageHook('onStartHarvestFeedingPhase', playerIndex, cardIndex)) {
      return this.respond()
    }
    return this.continueHarvestFeeding()
  }

  private continueHarvestFeeding(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.stageDispatch.continueStageHook('onHarvestFeedingPhase', playerIndex, cardIndex)) {
      return this.respond()
    }
    return this.executeFeedingLogic()
  }

  private continueHarvestFeedingQueue(feedQueue: FeedQueueEntry[]): SessionResponse {
    const next = feedQueue[0]
    if (!next) return this.startBreedPhase()
    const rest = feedQueue.slice(1)
    if (next.needsFeed) {
      this.startFeedSubFlow(next.index, next.remaining, next.foodUsed, rest)
      return this.respond()
    }
    return this.startHeatingOrContinue(next.index, rest)
  }

  private startHeatingOrContinue(playerIndex: number, feedQueue: FeedQueueEntry[]): SessionResponse {
    const player = this.state.players[playerIndex]
    if (!player) return this.continueHarvestFeedingQueue(feedQueue)
    const required = computeHeatingRequirement(this.state, player)
    if (required <= 0) return this.continueHarvestFeedingQueue(feedQueue)
    this.startHeatingSubFlow(playerIndex, required, feedQueue)
    return this.respond()
  }

  private executeFeedingLogic(): SessionResponse {
    const harvestOrder = this.getHarvestPlayerIndices()
    const feedQueue: FeedQueueEntry[] = []

    for (const i of harvestOrder) {
      const player = this.state.players[i]!
      const required = computeHarvestFeedingRequirement(this.state, player)
      const useFood = Math.min(player.resources.food, required)
      player.resources.food -= useFood
      const remaining = required - useFood

      const hasHarvestExchange = this.hasAnyHarvestExchange(player)

      if (remaining <= 0) {
        // Even when feeding is satisfied, give the player a chance to
        // engage harvest exchanges (e.g. C105 reverse trade spending bonus
        // food → resources). Only skip if there's nothing useful to do.
        if (!hasHarvestExchange) {
          if (useFood > 0) {
            this.logHarvestResourceEntry('log.harvestFeedDetail', player, { food: useFood })
          }
          feedQueue.push({ index: i, remaining: 0, foodUsed: useFood })
          continue
        }
        feedQueue.push({ index: i, remaining: 0, foodUsed: useFood, needsFeed: true })
        continue
      }

      const canConvert =
        player.resources.grain > 0 ||
        player.resources.vegetable > 0 ||
        hasHarvestExchange

      if (canConvert) {
        feedQueue.push({ index: i, remaining, foodUsed: useFood, needsFeed: true })
      } else {
        player.resources.begging += remaining
        this.logHarvestResourceEntry('log.harvestFeedDetail', player, {
          food: useFood,
          begging: remaining,
        })
        feedQueue.push({ index: i, remaining: 0, foodUsed: useFood })
      }
    }

    return this.continueHarvestFeedingQueue(feedQueue)
  }

  private continueEndHarvestEffects(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.stageDispatch.continueStageHook('onEndHarvest', playerIndex, cardIndex)) {
      return this.respond()
    }
    return this.continueAfterHarvestEffects()
  }

  private continueAfterHarvestEffects(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.stageDispatch.continueStageHook('onAfterHarvest', playerIndex, cardIndex)) {
      return this.respond()
    }
    delete this.state.harvestReapSummary
    delete this.state.harvestBreedSummary
    return this.finalizeRound()
  }

  private dispatchFutureMeepleResolvedListeners(
    events: readonly GameEvent[],
  ): void {
    const resolvedEvents = events.filter((event) => event.type === 'futureMeeple.resolved')
    if (resolvedEvents.length === 0) return
    const space = this.createSyntheticSpace('future-meeple-resolved')
    for (const player of this.state.players) {
      const transactionEvents = resolvedEvents.filter((event) => event.playerId === player.id)
      if (transactionEvents.length === 0) continue
      const results = runCardListeners({
        state: this.state,
        player,
        space,
        actionId: 'future-meeple-resolved',
        phase: 'immediatelyAfter',
        transactionEvents,
      })
      if (results.length === 0) continue
      if (!Array.isArray(this.state.events)) this.state.events = []
      if (!Number.isSafeInteger(this.state.nextEventSeq) || this.state.nextEventSeq < 1) {
        this.state.nextEventSeq = 1
      }
      const store = new EventStore()
      const frame = store.beginFrame({
        actorPlayerId: player.id,
        sourceActionId: 'future-meeple-resolved',
      })
      executeImmediateSpecialEffectFlows({
        state: this.state,
        player,
        space,
        eventSink: frame.sink,
        results,
      })
      const completed = frame.complete(this.state)
      if (completed.length > 0) {
        store.commitTransaction(this.state)
      } else {
        store.rollbackTransaction()
      }
    }
  }

  private continueBeforeStartOfTurn(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.stageDispatch.continueStageHook('onBeforeStartOfTurn', playerIndex, cardIndex)) {
      return this.respond()
    }
    this.state.players.forEach((player) => {
      resetRoundPlacements(player)
      delete player._extraTurnSkipCountsByCard
      delete player._extraTurnConsumedCountsByCard
    })
    const roundOpen = createRoundOpenById(this.state.roundActionOrder)
    const futureResolvedEvents = this.buildFutureMeepleResolvedEvents()
    const futureMeepleReceiveFlow = this.buildFutureMeepleReceiveFlow()
    const openActionSpaceIds = new Set<string>()
    const actionSpaceResourcesBefore = new Map<string, Resource>()
    const actionEvents = this.state.actionSpaces.flatMap((space): ImmediateEventDraft[] => {
      const openRound = roundOpen.get(space.id) ?? space.roundAvailable
      const events: ImmediateEventDraft[] = []
      const alreadyRevealed = this.state.events.some((event) =>
        event.type === 'action.revealed' &&
        event.actionId === space.id &&
        event.roundSlot === this.state.round)
      if (this.state.round === openRound && !alreadyRevealed) {
        events.push({
          type: 'action.revealed',
          actionId: space.id,
          roundSlot: this.state.round,
        })
      }
      const exclusiveUse = space.exclusiveUse
      if (exclusiveUse && this.state.round >= exclusiveUse.untilRound) {
        events.push({
          type: 'action.exclusiveUseCleared',
          actionId: space.id,
          playerId: exclusiveUse.playerId,
          sourceCardId: exclusiveUse.sourceCardId,
        })
        delete space.exclusiveUse
      }
      if (this.state.round >= openRound) {
        openActionSpaceIds.add(space.id)
        actionSpaceResourcesBefore.set(space.id, { ...space.resources })
      }
      return events
    })
    applyRoundGrowth(this.state)
    applySeasonPreparationAdjustments(this.state)
    const accumulatedActionEvents = this.state.actionSpaces.flatMap((space): ImmediateEventDraft[] => {
      if (!openActionSpaceIds.has(space.id)) return []
      const before = actionSpaceResourcesBefore.get(space.id) ?? emptyResources
      const resources: Partial<Resource> = {}
      resourceKeyList.forEach((key) => {
        const delta = (space.resources[key] ?? 0) - (before[key] ?? 0)
        if (delta > 0) resources[key] = delta
      })
      if (Object.keys(resources).length === 0) return []
      return [{
        type: 'action.accumulated',
        spaceId: space.id,
        resources,
      }]
    })
    applyFutureMeeples(this.state, { skipResourceReceive: true, keepActionTokens: true })
    const committedStartEvents = appendImmediateEvents(this.state, [
      { type: 'round.started' },
      ...futureResolvedEvents,
      ...actionEvents,
      ...accumulatedActionEvents,
    ])
    this.dispatchFutureMeepleResolvedListeners(committedStartEvents)
    return this.startFutureMeepleResolution(futureMeepleReceiveFlow)
  }

  private startFutureMeepleResolution(
    receiveFlow = this.buildFutureMeepleReceiveFlow(),
  ): SessionResponse {
    if (receiveFlow) {
      this.stageDispatch.startFlow(
        receiveFlow.flow,
        'futureMeepleReceives',
        receiveFlow.playerIndex,
        0,
        0,
      )
      return this.respond()
    }
    return this.continueFutureMeepleAnytimeWindow()
  }

  private continueFutureMeepleAnytimeWindow(
    resumePlayerIndex?: number,
    repeatCurrentPlayer = false,
  ): SessionResponse {
    const playerIndices: number[] = []
    for (const entry of this.state.futureMeeples) {
      if (entry.round !== this.state.round) continue
      const hasAction = (['field', 'stable', 'forest', 'moor'] as const)
        .some((key) => futureMeepleActionCount(entry, key) > 0)
      if (!hasAction) continue
      const playerIndex = findPlayerIndexById(this.state, entry.playerId)
      if (playerIndex >= 0 && !playerIndices.includes(playerIndex)) playerIndices.push(playerIndex)
    }
    playerIndices.sort((left, right) => left - right)
    let start = 0
    if (resumePlayerIndex !== undefined) {
      const resumeOffset = playerIndices.indexOf(resumePlayerIndex)
      if (resumeOffset >= 0) {
        start = resumeOffset + (repeatCurrentPlayer ? 0 : 1)
      } else {
        const nextOffset = playerIndices.findIndex((playerIndex) => playerIndex > resumePlayerIndex)
        start = nextOffset === -1 ? playerIndices.length : nextOffset
      }
    }
    for (let offset = Math.max(0, start); offset < playerIndices.length; offset += 1) {
      const playerIndex = playerIndices[offset]!
      this.state.currentPlayerIndex = playerIndex
      const entries = this.buildAnytimeEntries({ nestedWindow: true })
        .filter((entry) => entry.descriptor.actionId === 'exchange')
      if (entries.length === 0) continue
      const flow: ActionFlow = {
        type: 'xor',
        optional: true,
        promptKey: 'ui.interactionOptionalAction',
        children: entries.map(({ descriptor, flow: entryFlow }) => ({
          ...tagInjectedAnytimeFlow(entryFlow),
          optionId: descriptor.id,
          choiceLabelKey: descriptor.labelKey,
          choiceLabelParams: descriptor.labelParams,
          sourceCard: descriptor.sourceCard ?? entryFlow.sourceCard,
        })),
      }
      this.stageDispatch.startFlow(
        flow,
        'futureActionAnytimeWindow',
        playerIndex,
        0,
        playerIndex,
      )
      return this.respond()
    }
    return this.startCurrentFutureMeepleActions()
  }

  private startCurrentFutureMeepleActions(): SessionResponse {
    const futureMeepleActionFlow = this.buildFutureMeepleActionFlow()
    applyFutureMeeples(this.state, { skipResourceReceive: true })
    if (futureMeepleActionFlow) {
      this.stageDispatch.startFlow(
        futureMeepleActionFlow.flow,
        'futureMeepleActions',
        futureMeepleActionFlow.playerIndex,
        0,
        0,
      )
      return this.respond()
    }
    return this.continueAfterFutureMeepleActions()
  }

  private continueAfterFutureMeepleActions(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.stageDispatch.continueStageHook('onBeforeWork', playerIndex, cardIndex)) {
      return this.respond()
    }
    return this.continueAfterBeforeWork()
  }

  private continueAfterBeforeWork(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.stageDispatch.continueStageHook('onRoundStart', playerIndex, cardIndex)) {
      return this.respond()
    }
    const frozenStartIdx = this.state.players.findIndex((player) => player.id === this.state.roundFirstPlayerId)
    const startIdx = frozenStartIdx === -1
      ? this.state.players.findIndex((player) => player.startPlayer)
      : frozenStartIdx
    const frozenOrderStartIdx = startIdx === -1 ? 0 : startIdx
    this.state.currentPlayerIndex = frozenOrderStartIdx
    if (this.state.round >= 2 && startIdx >= 0) {
      incFirstPlayer(this.state.players[startIdx]!)
    }
    this.state.roundPhase = 'work'
    appendImmediateEvents(this.state, [{ type: 'work.started' }])
    const workComplete = roundPhase.roundWorkComplete(this.state)
    let roundStartedSeq = -1
    for (const event of this.state.events) {
      if (event.type === 'round.started') roundStartedSeq = event.seq
    }
    const placedBeforeWork = this.state.events.some((event) =>
      event.type === 'worker.placed' && event.seq > roundStartedSeq,
    )
    if (!workComplete) {
      const previousIdx = (frozenOrderStartIdx + this.state.players.length - 1) % this.state.players.length
      this.state.currentPlayerIndex = roundPhase.nextSeatedPlayerIdx(
        this.state,
        this.state.players,
        previousIdx,
      )
    }
    this.state.roundStartSnapshot = this.buildRoundSnapshot(this.state)
    this.engineStack.clear()
    this.history = []
    this.actionStartIndex = null
    if (workComplete && placedBeforeWork) return this.continueAllWorkersPlacedHooks()
    return this.respond()
  }

  private continueCurrentFutureMeepleActions(): SessionResponse {
    const futureMeepleReceiveFlow = this.buildFutureMeepleReceiveFlow()
    const futureResolvedEvents = this.buildFutureMeepleResolvedEvents()
    applyFutureMeeples(this.state, { skipResourceReceive: true, keepActionTokens: true })
    if (futureResolvedEvents.length > 0) {
      const committedEvents = appendImmediateEvents(this.state, futureResolvedEvents)
      this.dispatchFutureMeepleResolvedListeners(committedEvents)
    }
    return this.startFutureMeepleResolution(futureMeepleReceiveFlow)
  }

  /** S2 Task 10 part 5: thin delegator — body lives in `phases/round.ts`. */
  private continueAfterReorganize_returningHome(_playerIndex: number): void {
    return roundPhase.continueAfterReorganizeReturningHome(this)
  }

  /** S2 Task 11 part 3: thin delegator — body lives in `phases/harvest.ts`. */
  private continueAfterReorganize_harvestBreed(playerIndex: number): void {
    return harvestPhase.continueAfterReorganizeHarvestBreed(this, playerIndex)
  }

  /** S2 Task 10 part 5: thin delegator — body lives in `phases/round.ts`. */
  private continueAfterReorganize_roundEnd(
    playerIndex: number,
    originPlayerIndex: number | null,
    triggerActionId?: string | null,
  ): void {
    return roundPhase.continueAfterReorganizeRoundEnd(this, playerIndex, originPlayerIndex, triggerActionId)
  }

  /**
   * Umbrella resume entry-point for sub-flow frames that complete via stage
   * resume. Today only `onReorganizeComplete` flows through here — it
   * dispatches to one of the trigger-specific continueAfterReorganize_*
   * helpers based on `extra.trigger`. Future sub-flows (feed, confirm) will
   * register their own switch arms here as Task 9 introduces them.
   *
   * Non-reorganize hooks are resumed by StageDispatch.
   */
  private continueAfterSubFlow(stageResume: StageResumeState) {
    if (stageResume.hook === 'onReorganizeComplete') {
      const trigger = stageResume.extra?.trigger ?? 'anytime'
      if (trigger === 'returning-home') {
        return this.continueAfterReorganize_returningHome(stageResume.playerIndex)
      }
      if (trigger === 'harvest-breed') {
        if (this.engineStack.depth() > 0) {
          this.runEngineSteps()
          return
        }
        return this.continueAfterReorganize_harvestBreed(stageResume.playerIndex)
      }
      if (trigger === 'round-end') {
        return this.continueAfterReorganize_roundEnd(
          stageResume.playerIndex,
          stageResume.extra?.originPlayerIndex ?? null,
          stageResume.extra?.triggerActionId ?? null,
        )
      }
      // 'anytime': the reorganize frame has already been popped in
      // runEngineSteps' done/blocked branch. If a parent frame remains on
      // the stack, we are returning from an "anytime" sub-flow detour
      // (formerly the `pausedEngine` save/restore path) — just resume the
      // parent engine.
      if (this.engineStack.depth() > 0) {
        this.runEngineSteps()
        return
      }
      return this.continueAfterReorganize_roundEnd(
        stageResume.playerIndex,
        stageResume.extra?.originPlayerIndex ?? null,
        stageResume.extra?.triggerActionId ?? null,
      )
    }
    this.stageDispatch.resume(stageResume)
  }

  private effectiveOwnerIndexForFrame(
    frame: EngineFrame,
    nodeId?: string | null,
    pending?: { effectiveOwnerPlayerId?: string } | null,
  ): number {
    const frameOwnerId = this.state.players[frame.ownerPlayerIndex]?.id
    const ownerId =
      pending?.effectiveOwnerPlayerId ??
      (nodeId ? frame.engine.getEffectiveOwnerPlayerId(nodeId, frameOwnerId) : frameOwnerId)
    if (!ownerId) return frame.ownerPlayerIndex
    const ownerIndex = findPlayerIndexById(this.state, ownerId)
    return ownerIndex === -1 ? frame.ownerPlayerIndex : ownerIndex
  }

  private visiblePlayerIndexForFrame(frame: EngineFrame): number {
    return frame.deferredPlayerSwitch?.confirmed
      ? frame.deferredPlayerSwitch.toPlayerIndex
      : frame.ownerPlayerIndex
  }

  private returnTargetIndexForFrame(frame: EngineFrame): {
    playerIndex: number
    returnPlayerStack?: number[]
  } {
    const stack = frame.deferredPlayerSwitch?.returnPlayerStack ?? []
    if (stack.length === 0) return { playerIndex: frame.ownerPlayerIndex }
    return {
      playerIndex: stack[stack.length - 1]!,
      returnPlayerStack: stack.slice(0, -1),
    }
  }

  private pushNestedReturnPointForFrame(frame: EngineFrame, playerIndex: number): void {
    if (
      !frame.deferredPlayerSwitch?.confirmed ||
      frame.deferredPlayerSwitch.toPlayerIndex !== playerIndex ||
      playerIndex === frame.ownerPlayerIndex
    ) {
      return
    }
    const stack = frame.deferredPlayerSwitch.returnPlayerStack ?? []
    if (stack[stack.length - 1] === playerIndex) return
    this.engineStack.setDeferredPlayerSwitch({
      ...frame.deferredPlayerSwitch,
      returnPlayerStack: [...stack, playerIndex],
    })
  }

  private currentFrameOwnerPlayerId(defaultPlayerId?: string): string | undefined {
    const frame = this.engineStack.current()
    if (!frame) return defaultPlayerId
    return this.state.players[frame.ownerPlayerIndex]?.id ?? defaultPlayerId
  }

  private acknowledgeCurrentActionAnimalReorgRequest(): void {
    this.engineStack.current()?.engine.acknowledgePendingActionRequest()
  }

  private runEngineSteps(): void {
    return this.withCtx(() => this.runEngineStepsInContext())
  }

  private runEngineStepsInContext(): void {
    let frame = this.engineStack.current()
    if (!frame || frame.ownerPlayerIndex === null || !frame.spaceId) return
    const space = this.getSpaceById(frame.spaceId)
    if (!this.state.players[frame.ownerPlayerIndex] || !space) return

    while (true) {
      const { nextNodeId, activeActionContext } = frame.engine.peekNextDriverStep()
      const effectivePlayerIndex = this.effectiveOwnerIndexForFrame(frame, nextNodeId)
      const frameOwnerPlayer = this.state.players[frame.ownerPlayerIndex]
      const player = this.state.players[effectivePlayerIndex]
      if (!frameOwnerPlayer || !player) return
      const before = this.clonePlayer(player)
      const step = frame.engine.proceed(this.buildEngineExecutionContext(player, space))
      this.flushEngineLog()

      if (step.type === 'blocked' && step.mandatory === true && step.actionId) {
        if (this.markProvisionalHostBlocked(frame, step.nodeId)) return
        this.engineStack.clearDeferredPlayerSwitch()
        const pendingSet = frame.engine.setEngineBlockedPending(step.nodeId, step.actionId)
        if (!pendingSet) throw new Error(`missing mandatory blocked engine node: ${step.nodeId}`)
        frame.engine.flushEventTransaction({ state: this.state, player, space })
        this.flushEngineLog()
        return
      }

      if (step.type === 'blocked' || step.type === 'done') {
        // Snapshot the relevant fields from the current frame BEFORE deciding
        // whether to pop. runPlaceFarmerAfterHooks mutates the same frame's
        // engine, so we keep the frame on the stack for that branch.
        const visiblePlayerIndex = this.visiblePlayerIndexForFrame(frame)
        const returnTarget = this.returnTargetIndexForFrame(frame)
        if (visiblePlayerIndex !== returnTarget.playerIndex) {
          this.engineStack.setDeferredPlayerSwitch({
            fromPlayerIndex: visiblePlayerIndex,
            toPlayerIndex: returnTarget.playerIndex,
            returnPlayerStack: returnTarget.returnPlayerStack,
          })
          frame.engine.flushEventTransaction({ state: this.state, player, space })
          this.flushEngineLog()
          this.startConfirmPlayerSwitch(visiblePlayerIndex, returnTarget.playerIndex)
          return
        }
        const isActionEngine = frame.source.kind === 'action'
        const ownerIdx = frame.ownerPlayerIndex
        if (this.stageDispatch.completeFrameIfStage(frame)) return
        if (isActionEngine && this.runPlaceFarmerAfterHooks(frameOwnerPlayer, space)) {
          // The frame's engine/source were replaced in-place; loop again with
          // the same frame.
          frame = this.engineStack.current()!
          continue
        }
        if (this.hasPendingAnimals(frameOwnerPlayer)) {
          const originIdx = this.turnOwnerPlayerIndex ?? ownerIdx
          this.engineStack.pop()
          this.startReorganizeSubFlow(ownerIdx, 'anytime', {
            originPlayerIndex: originIdx,
            triggerActionId: this.endTurnTriggerActionId(frame),
          })
          return
        }
        if (this.turnOwnerPlayerIndex !== null) {
          const ownerIndexLocal = this.turnOwnerPlayerIndex
          const triggerActionId = this.endTurnTriggerActionId(frame)
          this.finalizeActionLog(frameOwnerPlayer)
          this.engineStack.pop()
          this.continueEndTurnHooks(ownerIndexLocal, 0, triggerActionId)
          return
        }
        this.finalizeActionLog(frameOwnerPlayer)
        this.engineStack.pop()
        return
      }

      if (step.type === 'choice') {
        // breed action (e.g. harvest reap or B104 last-harvest enforcement)
        // emits ActionExecutionResult { type: 'request', request: { kind:
        // 'animal-reorg' } } — the engine wraps it in the new 'request'
        // branch and surfaces it as step.type === 'choice', losing the
        // direct kind discriminator. Detect it via the host node's request
        // field and pivot to the same anytime sub-flow path the previous
        // 'animalReorg' result took. After Task 6 we leave the parent
        // frame on the stack and push a reorganize sub-flow frame.
        // Task 2: read public wait data through PendingView and resume metadata through PendingCursor.
        const pendingView = this.engineStack.peekPendingView()
        const pendingCursor = this.engineStack.peekPendingCursor()
        const hostRequestKind = pendingView?.request.kind ?? null
        const isReorgSubFlow =
          frame.source.kind === 'flow'
          && (frame.source.flow as { actionId?: string }).actionId === 'reorganize'
        if (hostRequestKind === 'animal-reorg' && !isReorgSubFlow) {
          const pIdx = this.effectiveOwnerIndexForFrame(
            frame,
            pendingCursor?.hostNodeId,
            pendingView,
          )
          this.acknowledgeCurrentActionAnimalReorgRequest()
          const trigger = frame.stageResume?.hook === 'onBreedPhase'
            ? 'harvest-breed'
            : 'anytime'
          this.startReorganizeSubFlow(pIdx, trigger)
          return
        }
        // Synthetic interaction-only frames (the `__interaction_only__`
        // leaf-flow frames pushed by start* triggers — confirm-next-player /
        // confirm-player-switch / feed / dev-fence-select) must NOT enter
        // the auto-resolve path below. Their engine has no registered
        // handler for `__interaction_only__`, so `resolveChoice` would
        // silently no-op without resolving the pending host and the
        // next `proceed()` would surface the same step again — an infinite
        // loop. The pending envelope itself is the source of truth;
        // yield to the client and wait for the matching resolveChoice
        // command. Predicate `isSyntheticInteractionFrame` (S-2) replaces
        // the previous hard-coded kind list so future synthetic frames
        // (Task 11+) inherit the right behaviour automatically.
        if (isSyntheticInteractionFrame(frame)) {
          if (
            frame.reason === 'post-reap-anytime' &&
            this.engineStack.peekPendingView()?.syntheticKind === 'post-reap-anytime'
          ) {
            frame.engine.flushEventTransaction({ state: this.state, player, space })
            this.flushEngineLog()
            if (this.buildAnytimeEntries().length === 0) {
              const ownerPlayerIndex = frame.ownerPlayerIndex
              this.engineStack.pop()
              this.continuePostReapAnytimeWindow(ownerPlayerIndex)
            }
          }
          return
        }
        // Reorganize confirmations carry the zone assignment in the resolve
        // payload. Even when only "confirm" is offered (harvest/return-home),
        // this cannot use the generic single-option auto-resolve path.
        if (hostRequestKind === 'animal-reorg') {
          return
        }
        // Lazy confirmation: if we silently switched players and now hit a choice,
        // show confirmPlayerSwitch first. The parent pending host stays unresolved in the engine.
        const choiceOwnerIndex = this.effectiveOwnerIndexForFrame(
          frame,
          pendingCursor?.hostNodeId,
          pendingView,
        )
        const visiblePlayerIndex = frame.deferredPlayerSwitch?.confirmed
          ? frame.deferredPlayerSwitch.toPlayerIndex
          : frame.deferredPlayerSwitch?.fromPlayerIndex ?? frame.ownerPlayerIndex
        if (choiceOwnerIndex !== visiblePlayerIndex) {
          const returnPlayerStack = frame.deferredPlayerSwitch?.returnPlayerStack
          this.engineStack.setDeferredPlayerSwitch({
            fromPlayerIndex: visiblePlayerIndex,
            toPlayerIndex: choiceOwnerIndex,
            returnPlayerStack,
          })
        }
        if (frame.deferredPlayerSwitch && !frame.deferredPlayerSwitch.confirmed) {
          const { fromPlayerIndex, toPlayerIndex } = frame.deferredPlayerSwitch
          frame.engine.flushEventTransaction({ state: this.state, player, space })
          this.flushEngineLog()
          this.startConfirmPlayerSwitch(fromPlayerIndex, toPlayerIndex)
          return
        }
        if (
          hostRequestKind === 'farm-select' ||
          hostRequestKind === 'selection' ||
          !!this.isSelectionPromptKey(pendingView?.promptKey)
        ) {
          frame.engine.flushEventTransaction({ state: this.state, player, space })
          this.flushEngineLog()
          return
        }
        const pendingActionId = pendingCursor?.pendingActionId
        const pendingActionCanResolve = pendingActionId
          ? this.registry.get(pendingActionId)?.resolveChoice !== undefined
          : false
        if (frame.engine.hasPendingHostRequiringExternalResolution(pendingActionCanResolve)) {
          return
        }
        if (step.choice.options.length === 1) {
          let autoOptions = step.choice.options
          while (autoOptions.length === 1) {
            const auto = autoOptions[0]
            if (auto?.disabled === true) return
            const resolvedActionId = this.peekHostPendingActionId()
            const resolvedSourceCard = this.peekPendingSourceCard()
            const result = frame.engine.resolveChoice(
              auto.value,
              this.buildEngineExecutionContext(player, space),
            )
            this.flushEngineLog()
            if (result.type === 'flow') {
              this.pushNestedReturnPointForFrame(frame, effectivePlayerIndex)
            }
            if (result.type === 'ok' && resolvedActionId && !isInjectedAnytimeResult(result)) {
              this.recordActionResultDetails(result, frameOwnerPlayer.id, player.id, resolvedSourceCard)
              this.flushLeafActionDetail(resolvedActionId, false)
            }
            if (result.type === 'request' && result.request.kind === 'choice') {
              const requestOptions = result.request.options
              if (requestOptions.length === 1) {
                if (requestOptions[0]?.disabled === true) return
                autoOptions = requestOptions
                continue
              }
              // The follow-up pending host now lives on the engine's tree
              // (applyInteractionRequest -> pending envelope). The previous
              // GameCore pending-field mirror is gone (Task 10): every
              // consumer reads the live pending envelope.
              return
            }
            if (result.type === 'fail') {
              if (!frame.stageResume) {
                this.cleanupFailedWorkerPlacement(space, player, activeActionContext)
              }
              endTurnScope(frameOwnerPlayer)
              this.engineStack.pop()
              this.actionStartIndex = null
              this.actionStartPlayerSnapshot = null
              delete player._activeActionBonusSources
              this.turnOwnerPlayerIndex = null
              return
            }
            if (this.getAnimalCount(player) > this.getAnimalCount(before)) {
              const pIdx = effectivePlayerIndex
              // Match previous behavior: this is a fall-through reorganize
              // detour from auto-resolved choice — the parent frame is
              // discarded (no resume) before the sub-flow starts.
              this.engineStack.pop()
              this.startReorganizeSubFlow(pIdx, 'anytime')
              return
            }
            break
          }
          continue
        }
        // The pending host that produced this `step.type === 'choice'`
        // is the canonical source of the pending interaction (Task 10).
        // Yield to the client; `buildInteraction()` derives the response
        // shape from the pending envelope.
        frame.engine.flushEventTransaction({ state: this.state, player, space })
        this.flushEngineLog()
        return
      }

      if (step.type === 'ok' && step.result.type === 'fail') {
        if (!frame.stageResume) {
          this.cleanupFailedWorkerPlacement(space, player, activeActionContext)
        }
        endTurnScope(frameOwnerPlayer)
        this.engineStack.pop()
        this.actionStartIndex = null
        this.actionStartPlayerSnapshot = null
        delete player._activeActionBonusSources
        this.turnOwnerPlayerIndex = null
        return
      }

      if (step.type === 'ok' && step.result.type === 'flow') {
        this.pushNestedReturnPointForFrame(frame, effectivePlayerIndex)
      }

      if (
        step.type === 'ok' &&
        step.result.type === 'ok' &&
        !isInjectedAnytimeResult(step.result)
      ) {
        this.recordActionResultDetails(step.result, frameOwnerPlayer.id, player.id, step.sourceCard)
        this.flushLeafActionDetail(step.actionId, false)
      }

      // NOTE: the previous `step.result.type === 'animalReorg'` block lived
      // here, used to handle `breed` returning that variant explicitly when
      // animal count did not change (B104 last-harvest enforcement). Since
      // Task 5 migrated breed to emit `'request' + kind: 'animal-reorg'`,
      // the engine now wraps it in step.type === 'choice' (handled in the
      // dedicated reorg branch in the `step.type === 'choice'` block above
      // via the pending envelope request kind). The
      // generic `getAnimalCount > before` check below still picks up the
      // animals-bred path where breed returns `'ok'` so engine after-hooks
      // (D60 LargePottery, B104 SheepWalker, ...) keep firing on the
      // post-mutate state.

      if (this.getAnimalCount(player) > this.getAnimalCount(before)) {
        const pIdx = effectivePlayerIndex
        frame.engine.flushEventTransaction({ state: this.state, player, space })
        this.flushEngineLog()
        // Parent frame stays on the stack; reorganize sub-flow is pushed on
        // top. When it completes, StageDispatch resumes onReorganizeComplete
        // and calls back into the reorganize continuation.
        this.startReorganizeSubFlow(pIdx, 'anytime')
        return
      }
    }
  }

  getState(): SessionResponse {
    return this.withCtx(() => this.respond())
  }

  /**
   * Returns true when at least one global action hook or card listener for the
   * `isDoable` phase explicitly vetoes the action. Unlike the full
   * `applyIsDoable` path, this skips `space.canBeExecutedByPlayer` — that is
   * conservative for OR-flow actions and would over-block normal cases like
   * "OR(sow, bake-bread)" where every child is currently undoable but the
   * engine still wants to enter and present a skip-only choice.
   */
  private listenersVetoIsDoable(player: PlayerState, space: ActionSpace): boolean {
    const actionHookDoable = applyIsDoableHooksDetailed(
      { state: this.state, player, space, actionId: space.id },
      true,
    )
    if (actionHookDoable.vetoed) return true
    const ctx: import('../cards/card-listeners.ts').CardListenerContextInput = {
      state: this.state,
      player,
      space,
      actionId: space.id,
      phase: 'isDoable',
      doable: actionHookDoable.doable,
    }
    const matched = getMatchingListeners(ctx)
    for (const entry of matched) {
      const result = executeCardListener(entry.registration, ctx, listenerOwnerOptions(entry))
      if (result && result.doable === false) return true
    }
    return false
  }

  private isActionSpaceAvailableToPlayer(player: PlayerState, space: ActionSpace): boolean {
    return canProjectActionEntry(this.state, player, space, {
      isActionDoable: (entry, baseDoable) => this.hookDispatcher.applyIsDoable(
        { state: this.state, player, space: entry, actionId: entry.id },
        entry,
        baseDoable,
      ),
    })
  }

  getAvailableActions(playerIndex: number): { spaceId: string; nameKey: string }[] {
    return this.withCtx(() => this.getAvailableActionsInContext(playerIndex))
  }

  private getAvailableActionsInContext(playerIndex: number): { spaceId: string; nameKey: string }[] {
    const player = this.state.players[playerIndex]
    if (!player) return []
    return this.state.actionSpaces
      .filter((space) =>
        this.isActionSpaceAvailableToPlayer(player, space) &&
        !this.isFailedAuthoritativeCommand(normalizedCommand(
          'action',
          playerIndex,
          { spaceId: space.id },
        )),
      )
      .map((space) => ({ spaceId: space.id, nameKey: space.nameKey }))
  }

  /**
   * Compute which action spaces can be executed by the current player.
   * Returns a map of spaceId -> isExecutable for all action spaces.
   */
  getActionAvailability(playerIndex: number): Record<string, boolean> {
    return this.withCtx(() => this.getActionAvailabilityInContext(playerIndex))
  }

  private getActionAvailabilityInContext(playerIndex: number): Record<string, boolean> {
    const player = this.state.players[playerIndex]
    if (!player) return {}
    const availability = computeActionEntryAvailability(this.state, player, {
      isActionDoable: (space, baseDoable) => this.hookDispatcher.applyIsDoable(
        { state: this.state, player, space, actionId: space.id },
        space,
        baseDoable,
      ),
    })
    for (const spaceId of Object.keys(availability)) {
      if (this.isFailedAuthoritativeCommand(normalizedCommand(
        'action',
        playerIndex,
        { spaceId },
      ))) availability[spaceId] = false
    }
    return availability
  }

  getCardAvailability(
    playerIndex: number,
    actionAvailability = this.getActionAvailability(playerIndex),
  ): Record<string, boolean> {
    return this.withCtx(() => this.getCardAvailabilityInContext(playerIndex, actionAvailability))
  }

  private getCardAvailabilityInContext(
    playerIndex: number,
    actionAvailability = this.getActionAvailabilityInContext(playerIndex),
  ): Record<string, boolean> {
    const player = this.state.players[playerIndex]
    if (!player) return {}

    const canUseMinorImprovement =
      actionAvailability['meeting-place'] === true ||
      actionAvailability['wish-children'] === true
    const canUseImprovementAny =
      actionAvailability['major-improvement'] === true ||
      actionAvailability['house-redevelopment'] === true

    const occupationCosts: { spaceId: string; cost: Partial<Resource> }[] = []
    if (actionAvailability.lessons === true) {
      occupationCosts.push({
        spaceId: 'lessons',
        cost: getOccupationActionCost(player, 'lessons'),
      })
    }
    if (actionAvailability['lessons-4'] === true) {
      occupationCosts.push({
        spaceId: 'lessons-4',
        cost: getOccupationActionCost(player, 'lessons-4'),
      })
    }

    const result: Record<string, boolean> = {}

    player.occupationHand.forEach((occupationId) => {
      result[`occupation:${occupationId}`] = occupationCosts.some(({ spaceId, cost }) =>
        isOccupationPlayable(this.state, player, occupationId, cost, spaceId),
      )
    })

    player.minorHand.forEach((improvementId) => {
      const basePlayable = isMinorImprovementPlayable(this.state, player, improvementId)
      const improvement = getMinorImprovement(improvementId) ?? undefined
      result[`minor:${improvementId}`] =
        (canUseMinorImprovement &&
          basePlayable &&
          !isBlockedByMajorImprovementActionGate(improvement, ['minor'])) ||
        (canUseImprovementAny &&
          basePlayable &&
          !isBlockedByMajorImprovementActionGate(improvement, ['major', 'minor']))
    })

    getAvailableMajorImprovementIds(this.state).forEach((improvementId) => {
      result[`major:${improvementId}`] =
        canUseImprovementAny &&
        isMajorImprovementPlayable(
          this.state,
          player,
          improvementId,
          'improvement-any',
        )
    })

    return result
  }

  getPastureCapacities(): Record<string, Record<string, number>> {
    const result: Record<string, Record<string, number>> = {}
    this.state.players.forEach((player, idx) => {
      const zones = playerBoard(this.state, idx).animals.zones()
      result[player.id] = Object.fromEntries(
        zones.filter((z) => z.zoneType === 'pasture').map((z) => [z.id, z.capacity]),
      )
    })
    return result
  }

  takeAction(playerIndex: number, spaceId: string): SessionResponse {
    return this.runAuthoritativeCommand(
      'action',
      playerIndex,
      { spaceId },
      () => roundPhase.takeAction(this, playerIndex, spaceId),
    )
  }

  takeSpecialAction(
    playerIndex: number,
    cardId: string,
    actionId: MoorSpecialActionId,
    payload?: MoorSpecialActionPayload,
  ): SessionResponse {
    return this.runAuthoritativeCommand(
      'specialAction',
      playerIndex,
      { cardId, actionId, payload },
      () => roundPhase.takeSpecialAction(this, playerIndex, cardId, actionId, payload),
    )
  }

  /** S2 Task 10 part 4: thin delegator — body lives in `phases/round.ts`. */
  takeAnytimeAction(playerIndex: number, actionId: string): SessionResponse {
    return this.runAuthoritativeCommand(
      'anytime',
      playerIndex,
      { actionId },
      () => roundPhase.takeAnytimeAction(this, playerIndex, actionId),
    )
  }

  resolveOrdinaryCardDrawChoice(
    playerIndex: number,
    choiceId: string,
    keepCardId: string,
  ): SessionResponse {
    return this.runAuthoritativeCommand(
      'ordinaryDrawKeep',
      playerIndex,
      { choiceId, keepCardId },
      () => {
        const player = this.state.players[playerIndex]
        if (!player) return this.respond(false, 'invalid player')
        const result = resolveOrdinaryCardDrawChoice(this.state, {
          playerId: player.id,
          choiceId,
          keepCardId,
        })
        if (!result.ok) return this.respond(false, result.error)
        return this.respond(true, undefined, result.privateEvents)
      },
    )
  }

  private resolveEngineChoice(
    playerIndex: number,
    value: string,
    pushHistoryEntry: boolean,
    payload?: Record<string, unknown>,
  ): SessionResponse {
    const view = this.engineStack.peekPendingView()
    const cursor = this.engineStack.peekPendingCursor()
    const frame = this.engineStack.current()
    const pendingPlayerIndex = frame
      ? this.effectiveOwnerIndexForFrame(frame, cursor?.hostNodeId, view)
      : -1
    const pendingOptions = view?.choices ?? []
    const pendingSnapshot = pendingContextSnapshot(cursor)
    const pendingActionContext = pendingSnapshot?.actionContext
    const pendingSourceCard = view?.sourceCard ?? choicesSourceCard(pendingOptions)
    // 'choice' (typed), 'animal-reorg' (pending-envelope commit pathway), and any
    // ChoiceNode-emitted untyped request all flow through the engine's
    // resolveChoice path. Composite-node and optional-host emissions are
    // also accepted: those don't carry a special node but the engine
    // has a pending choice on the host node itself.
    // 'feed' / 'confirm-next-player' / 'confirm-player-switch' are
    // dispatched by the public `resolveChoice` to dedicated handlers and
    // never reach this method.
    const requestKind = view?.request.kind
    const isResolveChoiceTarget =
      requestKind === 'choice' ||
      requestKind === 'animal-reorg' ||
      requestKind === 'select-trigger'
    if (!isResolveChoiceTarget || pendingPlayerIndex !== playerIndex) {
      return this.respond(false, 'no pending choice for this player')
    }
    // Reject attempts to resolve a choice with an option that's been marked disabled
    // (e.g. B3 Moonshine's "play" option when the player can't afford 2 food).
    const chosenOption = pendingOptions.find((o) => o.value === value)
    if (chosenOption?.disabled) {
      return this.respond(false, 'option disabled')
    }
    if (!this.engine) return this.respond(false, 'no active engine')
    const player = this.state.players[pendingPlayerIndex]
    const space = this.getSpaceById(this.activeSpaceId)
    if (!player || !space) return this.respond(false, 'invalid state')

    const resolvedActionId = this.peekHostPendingActionId()
    const protectedDirectCancel = isProtectedActionCancel(resolvedActionId, value)

    if (pushHistoryEntry && !protectedDirectCancel) {
      this.pushHistory()
    }
    // Card-effect resolveChoice hook: if the pending choice has a sourceCard with a
    // registered CardEffect.resolveChoice, give the card a chance to produce a follow-up
    // ActionFlow that runs after the engine's own choice resolution.
    let insertedCardFollowUpFlow = false
    if (pendingSourceCard && !protectedDirectCancel) {
      const cardEffect = getCardEffect(pendingSourceCard)
      if (cardEffect?.resolveChoice) {
        const cardFlow = cardEffect.resolveChoice(this.state, player, value, {
          sourceCard: pendingSourceCard,
          actionContext: pendingActionContext,
          emitPrivateEvent: (event) => this.emitResponsePrivateEvent(event),
          reportProtectedObservation: (observation) => this.reportProtectedObservation(observation),
        })
        if (cardFlow && this.engine) {
          // Insert the follow-up so it runs after the engine finishes resolving the choice.
          // Mirrors the `{ type: 'flow' }` branch of the engine's own resolveChoice.
          this.engineStack.insertFlowAfterPendingChoice(cardFlow, player.id)
          insertedCardFollowUpFlow = true
        }
      }
    }
    const result = this.engine.resolveChoice(
      value,
      this.buildEngineExecutionContext(player, space),
      payload,
    )
    this.flushEngineLog()
    if (frame && (result.type === 'flow' || insertedCardFollowUpFlow)) {
      this.pushNestedReturnPointForFrame(frame, pendingPlayerIndex)
    }
    if (result.type === 'ok' && resolvedActionId && !isInjectedAnytimeResult(result)) {
      this.recordActionResultDetails(
        result,
        this.currentFrameOwnerPlayerId(player.id),
        player.id,
        pendingSourceCard,
      )
      this.flushLeafActionDetail(resolvedActionId, false)
    }
    if (result.type === 'request' && result.request.kind === 'choice') {
      // The engine's `applyInteractionRequest` already wired the follow-up
      // pending envelope (with promptKey + promptParams + options) onto the
      // tree; no previous GameCore pending-field mirror is needed (Task 10).
      return this.respond()
    }
    if (result.type === 'fail') {
      if (result.recoverable === true) {
        return this.respond(false, result.errorKey ?? 'action failed')
      }
      endTurnScope(this.state.players[frame?.ownerPlayerIndex ?? playerIndex] ?? player)
      this.engineStack.pop()
      this.actionStartIndex = null
      this.actionStartPlayerSnapshot = null
      delete player._activeActionBonusSources
      this.turnOwnerPlayerIndex = null
      return this.respond(false, result.errorKey ?? 'action failed')
    }
    this.deferPrivateEventDrainDepth += 1
    try {
      this.runEngineSteps()
    } finally {
      this.deferPrivateEventDrainDepth -= 1
    }
    return this.respond()
  }

  /**
   * Unified entry-point for resolving any pending envelope hosted on the
   * engineStack. Dispatches on the top-of-stack InteractionRequest's `kind`
   * discriminator so the previous `confirmNextPlayer` / `confirmPlayerSwitch` /
   * `confirmHarvestFeed` / `commitAnimalReorg` paths collapse into one
   * client-facing call. Plain `choice` interactions still route through
   * `resolveEngineChoice` after finite option validation.
   */
  resolveChoice(
    playerIndex: number,
    value: string,
    payload?: Record<string, unknown>,
  ): SessionResponse {
    return this.runAuthoritativeCommand(
      'choice',
      playerIndex,
      { value, payload },
      () => this.resolveChoiceInContext(playerIndex, value, payload),
    )
  }

  private resolveChoiceInContext(
    playerIndex: number,
    value: string,
    payload?: Record<string, unknown>,
  ): SessionResponse {
    const envelope = this.engineStack.peekPendingEnvelope()
    const view = this.engineStack.peekPendingView()
    const cursor = this.engineStack.peekPendingCursor()
    const request = view?.request
    if (request && envelope && view) {
      const plan = planResolveChoiceSubmission({
        envelope,
        view,
        pendingActionId: cursor?.pendingActionId,
        value,
        payload,
        isFarmPrompt: !!this.isFarmPromptKey(view.promptKey),
        isSelectionPrompt: !!this.isSelectionPromptKey(view.promptKey),
      })
      if (!plan.ok) return this.respond(false, plan.error)
      switch (plan.kind) {
        case 'confirm-next-player':
          return this.handleConfirmNextPlayerResolved(plan.nextPlayerIndex)
        case 'confirm-player-switch':
          return this.handleConfirmPlayerSwitchResolved(plan.fromPlayerIndex, plan.toPlayerIndex)
        case 'feed':
          return this.handleFeedResolved(playerIndex, plan.selections)
        case 'heating':
          return this.handleHeatingResolved(playerIndex, plan.payload as HeatingPaymentPayload | undefined)
        case 'post-reap-anytime':
          return this.handlePostReapAnytimeResolved(playerIndex)
        case 'engine-choice':
          return this.resolveEngineChoice(playerIndex, value, true, payload)
      }
    }
    return this.resolveEngineChoice(playerIndex, value, true, payload)
  }

  startDevFenceSelect(playerIndex: number): SessionResponse {
    return this.runAuthoritativeCommand(
      'devFenceSelect',
      playerIndex,
      {},
      () => this.startDevFenceSelectInContext(playerIndex),
    )
  }

  private startDevFenceSelectInContext(playerIndex: number): SessionResponse {
    if (this.state.gameOver) return this.respond(false, 'game is over')
    if (playerIndex !== this.state.currentPlayerIndex) return this.respond(false, 'not your turn')
    const player = this.state.players[playerIndex]
    if (!player) return this.respond(false, 'invalid player')
    if (this.engineStack.peekPendingEnvelope()) return this.respond(false, 'pending action exists')
    // Push a synthetic pending-only frame so `buildInteraction()` surfaces
    // the dev fence-select prompt via the same engineStack-driven path as
    // every other choice (Task 10).
    const options: ActionChoiceOption[] = [
        { value: 'confirm', labelKey: 'ui.interactionFenceConfirm' },
        { value: 'cancel', labelKey: 'ui.interactionFenceCancel' },
    ]
    this.pushPendingFrame({
      hostNodeId: this.nextSyntheticNodeId('interaction:dev-fence-select'),
      request: { kind: 'choice', options },
      choices: options,
      promptKey: 'ui.interactionFenceSelect',
      pendingActionId: INTERACTION_ONLY_ACTION_ID,
      ownerNodeId: null,
      contextSnapshot: {
        params: undefined,
        costs: undefined,
        costAttribution: undefined,
        sourceCard: undefined,
        actionContext: undefined,
      },
      effectiveOwnerPlayerId: player.id,
      syntheticKind: 'interaction-only',
    }, playerIndex, 'top-level')
    return this.respond()
  }

  private dispatchHarvestFeedConversionListeners(
    player: PlayerState,
    transactionEvents: readonly (GameEvent | DraftGameEvent)[],
  ): void {
    const space = this.createSyntheticSpace('harvest-feed-conversion')
    const results = runCardListeners({
      state: this.state,
      player,
      space,
      actionId: 'harvest-feed-conversion',
      phase: 'immediatelyAfter',
      transactionEvents,
    })
    if (results.length === 0) return
    if (!Array.isArray(this.state.events)) this.state.events = []
    if (!Number.isSafeInteger(this.state.nextEventSeq) || this.state.nextEventSeq < 1) {
      this.state.nextEventSeq = 1
    }
    const store = new EventStore()
    const frame = store.beginFrame({
      actorPlayerId: player.id,
      sourceActionId: 'harvest-feed-conversion',
    })
    executeImmediateSpecialEffectFlows({
      state: this.state,
      player,
      space,
      eventSink: frame.sink,
      results,
    })
    const completed = frame.complete(this.state)
    if (completed.length > 0) {
      store.commitTransaction(this.state)
    } else {
      store.rollbackTransaction()
    }
  }

  private handleFeedResolved(
    playerIndex: number,
    selections: FeedSelections,
  ): SessionResponse {
    const request = this.engineStack.peekPendingView()?.request
    const frame = this.engineStack.current()
    if (
      request?.kind !== 'feed' ||
      frame?.ownerPlayerIndex !== playerIndex
    ) {
      return this.respond(false, 'no pending feed')
    }
    const feedRequest = request
    const pendingRemaining = feedRequest.remaining
    const pendingFoodUsed = feedRequest.foodUsed
    const pendingFeedQueue = feedRequest.feedQueue ?? []
    this.pushHistory()
    const player = this.state.players[playerIndex]
    if (!player) return this.respond(false, 'invalid player')

    // Resolve each selection to its underlying CardExchange entry through the
    // unified (sourceId, exchangeIndex) path. The synthetic '__basic__'
    // sourceId resolves to the basic-conversion exchange table; everything
    // else looks up the player's played majors / minors / occupations.
    const lookupExchange = (
      sourceId: string,
      idx: number,
    ): import('../contract/cards').CardExchange | undefined => {
      if (sourceId === BASIC_CONVERSION_SOURCE_ID) {
        return getBasicConversionExchange(idx)
      }
      let card:
        | { exchanges?: readonly import('../contract/cards').CardExchange[] }
        | undefined
      if (player.improvements.includes(sourceId)) card = getMajorCard(sourceId)
      else if (player.minorPlayed.includes(sourceId)) card = getRegisteredMinorImprovement(sourceId)
      else if (player.occupationPlayed.includes(sourceId)) card = getRegisteredOccupation(sourceId)
      return card?.exchanges?.[idx]
    }

    // Enforce per-card exchange `max` (sourceId-level aggregate cap so that
    // multi-tier cards like D62 BeerTap collapse to one tier per harvest).
    const perSourceUsed = new Map<string, number>()
    type ResolvedSel = (typeof selections)[number] & {
      _exchange?: import('../contract/cards').CardExchange
    }
    const cappedSelections: ResolvedSel[] = selections.map((sel) => {
      if (!sel.sourceId || sel.count <= 0) return sel
      const exchange = lookupExchange(sel.sourceId, sel.exchangeIndex)
      if (!exchange) return sel
      let capped = sel.count
      if (exchange.max !== undefined) {
        const usedSoFar = perSourceUsed.get(sel.sourceId) ?? 0
        const sourceLimit = (exchange.triggers ?? []).includes('harvest')
          ? getRemainingHarvestExchangeUses(
              player,
              exchange.sourceId ?? sel.sourceId,
              exchange.max,
              this.state.round,
            )
          : exchange.max
        const remaining = Math.max(0, sourceLimit - usedSoFar)
        capped = Math.min(sel.count, remaining)
        perSourceUsed.set(sel.sourceId, usedSoFar + capped)
      }
      return { ...sel, count: capped, _exchange: exchange }
    })

    let totalFood = 0
    const usedResources: Partial<Resource> = { food: pendingFoodUsed }
    for (const sel of cappedSelections) {
      if (sel.count <= 0) continue
      const exchange = sel._exchange
      if (exchange) {
        // Bidirectional application: subtract `from`, add `to`. Caps per-key
        // by player's available resources (per-key `from` quantity allowed).
        let times = sel.count
        for (const [k, v] of Object.entries(exchange.from)) {
          const need = (v as number) * times
          const have = (player.resources as Record<string, number>)[k] ?? 0
          if (need > have) {
            // Scale down to whole-times that the player can actually afford.
            times = Math.min(times, Math.floor(have / Math.max(1, v as number)))
          }
        }
        if (times <= 0) continue
        // Subtract `from`
        const costMap: Record<string, number> = {}
        for (const [k, v] of Object.entries(exchange.from)) {
          const total = (v as number) * times
          if (isAnimalResourceKey(k)) {
            applyAnimalPayment(player, this.state, k, total)
          } else {
            ;(player.resources as Record<string, number>)[k] -= total
          }
          costMap[k] = total
          usedResources[k as keyof Resource] = (usedResources[k as keyof Resource] ?? 0) + total
          incResourceConverted(player, k as keyof Resource, total)
        }
        // Add `to`
        const gainMap: Record<string, number> = {}
        for (const [k, v] of Object.entries(exchange.to)) {
          const total = (v as number) * times
          ;(player.resources as Record<string, number>)[k] += total
          gainMap[k] = total
          if (k === 'food') {
            totalFood += total
            // Per-key conversion stat: only meaningful for forward (* -> food)
            // trades; reverse trades log under usedResources but skip food
            // conversion stats.
            const fromKey0 = (Object.keys(exchange.from)[0] ?? null) as
              | keyof Resource
              | null
            if (fromKey0) addFoodFromConversion(player, fromKey0, total)
          }
        }
        const feedConvertedEvents = appendImmediateEvents(this.state, [{
          type: 'harvest.feedConverted',
          playerId: player.id,
          source: sel.sourceName ?? 'Harvest conversion',
          cost: costMap,
          food: gainMap,
        }], { actorPlayerId: player.id })
        this.dispatchHarvestFeedConversionListeners(player, feedConvertedEvents)
        if ((exchange.triggers ?? []).includes('harvest') && exchange.max !== undefined) {
          recordHarvestExchangeUses(
            player,
            exchange.sourceId ?? sel.sourceId,
            this.state.round,
            times,
          )
        }
        // Dispatch CardExchange.sideEffect (e.g. E153 StoneSculptor bonusVp).
        if (exchange.sideEffect && times > 0) {
          PaymentSolver.applyTradeSideEffect(
            this.state,
            player,
            exchange.sideEffect,
            times,
            sel.sourceId ?? exchange.sourceId ?? 'unknown',
          )
        }
      }
    }
    const required = pendingRemaining
    const deficit = Math.max(0, required - totalFood)
    if (deficit > 0) {
      player.resources.begging += deficit
      usedResources.begging = (usedResources.begging ?? 0) + deficit
    }
    this.logHarvestResourceEntry('log.harvestFeedDetail', player, usedResources)

    const feedQueue = pendingFeedQueue
    // Pop the current feed synthetic frame before either pushing the next
    // player's frame (queue still has entries) or returning to the breed
    // phase (queue empty). Without this pop the engineStack would accumulate
    // one residual `__interaction_only__` frame per resolved player.
    const top = this.engineStack.current()
    if (top?.reason === 'feed') this.engineStack.pop()
    return this.startHeatingOrContinue(playerIndex, feedQueue)
  }

  private handleHeatingResolved(
    playerIndex: number,
    payload: HeatingPaymentPayload = {},
  ): SessionResponse {
    const request = this.engineStack.peekPendingView()?.request
    const frame = this.engineStack.current()
    if (
      request?.kind !== 'heating' ||
      frame?.ownerPlayerIndex !== playerIndex
    ) {
      return this.respond(false, 'no pending heating')
    }
    this.pushHistory()
    const player = this.state.players[playerIndex]
    if (!player) return this.respond(false, 'invalid player')

    const result = applyHeatingPayment(this.state, player, payload)
    appendImmediateEvents(this.state, [{
      type: 'harvest.heated',
      actorPlayerId: player.id,
      playerId: player.id,
      required: result.required,
      fuelUsed: result.fuelUsed,
      woodToFuel: result.woodToFuel,
      sickWorkerIds: result.sickWorkerIds,
    }])

    const top = this.engineStack.current()
    if (top?.reason === 'heating') this.engineStack.pop()
    return this.continueHarvestFeedingQueue(request.feedQueue ?? [])
  }

  private handlePostReapAnytimeResolved(playerIndex: number): SessionResponse {
    const frame = this.engineStack.current()
    if (
      frame?.reason !== 'post-reap-anytime' ||
      frame.ownerPlayerIndex !== playerIndex
    ) {
      return this.respond(false, 'no pending post-reap anytime window')
    }
    this.pushHistory()
    this.engineStack.pop()
    return this.continuePostReapAnytimeWindow(playerIndex)
  }

  /** S2 Task 10 part 3: thin delegator — body lives in `phases/round.ts`. */
  private handleConfirmPlayerSwitchResolved(
    fromPlayerIndex: number,
    toPlayerIndex: number,
  ): SessionResponse {
    return roundPhase.handleConfirmPlayerSwitchResolved(this, fromPlayerIndex, toPlayerIndex)
  }

  /** S2 Task 10 part 3: thin delegator — body lives in `phases/round.ts`. */
  private handleConfirmNextPlayerResolved(nextPlayerIndex: number): SessionResponse {
    return roundPhase.handleConfirmNextPlayerResolved(this, nextPlayerIndex)
  }

  private continueAllWorkersPlacedHooks(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.stageDispatch.continueStageHook('onAllWorkersPlaced', playerIndex, cardIndex)) {
      return this.respond()
    }
    return roundPhase.performRoundEnd(this)
  }

  /** S2 Task 10 part 7: thin delegator — body lives in `phases/round.ts`. */
  performRoundEnd(): SessionResponse {
    return this.runAuthoritativeCommand('performRoundEnd', null, {}, () => {
      if (!roundPhase.roundWorkComplete(this.state)) return this.respond(false, 'not all workers used')
      if (this.peekEnginePendingEnvelope()) return this.respond(false, 'pending action exists')
      return this.continueAllWorkersPlacedHooks()
    })
  }

  private continueBeforeReturnHomeHooks(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.stageDispatch.continueStageHook('onBeforeReturnHome', playerIndex, cardIndex)) {
      return this.respond()
    }
    return this.continueStartReturnHomeHooks()
  }

  private continueStartReturnHomeHooks(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.stageDispatch.continueStageHook('onStartReturnHome', playerIndex, cardIndex)) {
      return this.respond()
    }
    return this.continueReturnHomeHooks()
  }

  private continueReturnHomeHooks(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.stageDispatch.continueStageHook('onReturnHome', playerIndex, cardIndex)) {
      return this.respond()
    }
    const returnedWorkers = this.state.actionSpaces.flatMap((space) =>
      (space.takenBy ?? []).map((worker) => ({
        playerId: worker.playerId,
        workerId: worker.workerId,
      })),
    )
    if (returnedWorkers.length > 0) {
      appendImmediateEvents(this.state, [{
        type: 'worker.returned',
        workers: returnedWorkers,
        to: 'home',
      }])
    }
    this.state.players.forEach((p) => clearWorkPhaseBuildingResources(this.state, p.id))
    recoverInfirmaryWorkers(this.state)
    resetMoorSpecialActionCards(this.state)
    // workersAvailable is derived from workers[]; clearing takenBy returns workers home.
    this.state.actionSpaces.forEach((s) => { s.takenBy = [] })
    clearAllLinkedSpaceBlocks(this.state)
    // Release any workers that cards were holding (e.g. C022_BasketChair).
    for (const p of this.state.players) {
      const cardStates = p.cardStates ?? {}
      for (const cardId of Object.keys(cardStates)) {
        releaseWorkerFromCard(p, cardId)
      }
    }

    const pendingAnimal = this.state.players.findIndex((p) => this.hasPendingAnimals(p))
    if (pendingAnimal !== -1) {
      this.startReorganizeSubFlow(pendingAnimal, 'returning-home')
      return this.respond()
    }

    if (harvestRounds.includes(this.state.round)) {
      return this.startHarvest()
    }
    return this.finalizeRound()
  }

  /** S2 Task 11: thin delegators — bodies live in `phases/harvest.ts`. */
  private startHarvest(): SessionResponse { return harvestPhase.startHarvest(this) }
  private startBreedPhase(): SessionResponse { return harvestPhase.startBreedPhase(this) }

  private continueAfterFeedingPhase(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.stageDispatch.continueStageHook('onEndHarvestFeedingPhase', playerIndex, cardIndex)) {
      return this.respond()
    }
    const harvestOrder = this.getHarvestPlayerIndices()
    this.state.harvestBreedSummary = {}

    // E58 LunchtimeBeer-style cards opt out of breeding for the current round.
    const breedOrder = harvestOrder.filter((index) => {
      const p = this.state.players[index]
      return p ? !this.hasPassFieldAndBreed(p) : false
    }).map((index, order) => ({ index, order }))
      .sort((left, right) => {
        const leftPlayer = this.state.players[left.index]
        const rightPlayer = this.state.players[right.index]
        const leftPriority = leftPlayer ? getHarvestBreedOrderPriority(this.state, leftPlayer) : 0
        const rightPriority = rightPlayer ? getHarvestBreedOrderPriority(this.state, rightPlayer) : 0
        return leftPriority - rightPriority || left.order - right.order
      })
      .map((entry) => entry.index)
    const flow = this.buildHarvestBreedFlow(harvestOrder, breedOrder)
    if (flow) {
      this.stageDispatch.startFlow(flow, 'onBreedPhase', 0, 0)
      return this.respond()
    }
    return this.continueEndHarvestEffects()
  }

  private buildHarvestBreedFlow(harvestOrder: number[], breedOrder: number[]): ActionFlow | null {
    const children: ActionFlow[] = []
    for (const index of harvestOrder) {
      const p = this.state.players[index]
      if (!p) continue
      const gainedAnimalDuringFeeding = this.state.events.some((event) =>
        event.type === 'harvest.feedConverted'
        && event.round === this.state.round
        && event.playerId === p.id
        && animalKeysForState(this.state).some((animal) => (event.food[animal] ?? 0) > 0),
      )
      if (gainedAnimalDuringFeeding && this.hasPendingAnimals(p)) {
        children.push({
          type: 'leaf',
          actionId: 'reorganize',
          actionContext: { trigger: 'harvest-breed' },
          targetPlayerId: p.id,
        })
      }
    }
    for (const index of breedOrder) {
      const p = this.state.players[index]
      if (!p) continue
      children.push({ ...breedLeaf('harvest'), targetPlayerId: p.id })
    }
    if (children.length === 0) return null
    if (children.length === 1) {
      return children[0]
    }
    return { type: 'seq', children }
  }

  /** S2 Task 10 part 7: thin delegator — body lives in `phases/round.ts`. */
  private finalizeRound(): SessionResponse { return roundPhase.finalizeRound(this) }

  private continueRoundEndHooks(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.stageDispatch.continueStageHook('onRoundEnd', playerIndex, cardIndex)) {
      return this.respond()
    }
    return this.continueAfterRoundEnd()
  }

  private continueAfterRoundEnd(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.stageDispatch.continueStageHook('onAfterRoundEnd', playerIndex, cardIndex)) {
      return this.respond()
    }
    this.state.players.forEach((p) => {
      for (const w of p.workers) {
        if (w.isActive) w.isNewborn = false
      }
    })
    this.state.round += 1
    if (this.state.round > 14) {
      return this.continueBeforeEndGameHooks(0, 0)
    }
    this.state.roundFirstPlayerId = this.state.players.find((player) => player.startPlayer)?.id
    advanceThroughTheSeasons(this.state)
    return this.continueBeforeStartOfTurn()
  }

  private continueBeforeEndGameHooks(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (cardIndex === 0 && this.stageDispatch.continueBeforeEndGamePlayerDispatch(playerIndex)) {
      return this.respond()
    }
    return this.continuePreScoringWindow()
  }

  private continuePreScoringWindow(playerIndex = 0): SessionResponse {
    for (let currentPlayerIndex = playerIndex; currentPlayerIndex < this.state.players.length; currentPlayerIndex += 1) {
      this.state.currentPlayerIndex = currentPlayerIndex
      const entries = this.buildAnytimeEntries({ preScoringOnly: true })
      if (entries.length === 0) continue
      const flow: ActionFlow = {
        type: 'xor',
        optional: true,
        promptKey: 'ui.interactionOptionalAction',
        children: entries.map(({ descriptor, flow: entryFlow }) => ({
          ...tagInjectedAnytimeFlow(entryFlow),
          optionId: descriptor.id,
          choiceLabelKey: descriptor.labelKey,
          choiceLabelParams: descriptor.labelParams,
          sourceCard: descriptor.sourceCard ?? entryFlow.sourceCard,
        })),
      }
      this.stageDispatch.startFlow(
        flow,
        'preScoringWindow',
        currentPlayerIndex,
        0,
        currentPlayerIndex,
      )
      return this.respond()
    }
    if (!this.state.gameOver) {
      this.state.gameOver = true
      appendImmediateEvents(this.state, [{ type: 'game.ended' }])
    }
    return this.respond()
  }

  /**
   * Record a single player's card pick for the current draft round. When all
   * seated players have submitted, the round advances (pools rotate) and, once
   * the final round is complete, `finalizeDraft` copies each player's `kept`
   * cards back to `occupationHand` / `minorHand` and flips `phase='playing'`.
   *
   * Exact retries return the existing result, including after round advancement
   * or draft finalization. Other non-draft submissions, unknown players,
   * out-of-pool picks, or conflicting retries return `ok:false`.
   */
  /** S2 Task 12 part 2: thin delegator — body lives in `phases/draft.ts`. */
  submitDraftPick(playerId: string, pick: DraftPickPayload): SessionResponse {
    return this.runAuthoritativeCommand(
      'draftPick',
      this.state.players.findIndex((player) => player.id === playerId),
      { playerId, pick },
      () => draftPhase.submitDraftPick(this, playerId, pick),
    )
  }

  submitParentSelection(
    playerIndex: number,
    submission: ParentSelectionSubmission,
  ): SessionResponse {
    return this.runAuthoritativeCommand(
      'parentSelection',
      playerIndex,
      submission,
      () => this.submitParentSelectionInContext(playerIndex, submission),
    )
  }

  private submitParentSelectionInContext(
    playerIndex: number,
    submission: ParentSelectionSubmission,
  ): SessionResponse {
    const player = this.state.players[playerIndex]
    if (!player) return this.respond(false, 'invalid player')
    const result = commitParentSelection(this.state, player.id, submission)
    if (!result.ok) return this.respond(false, result.error)
    if (this.state.phase === 'playing') {
      return this.continueCurrentFutureMeepleActions()
    }
    return this.respond()
  }

  loadState(raw: unknown): SessionResponse {
    return this.runAuthoritativeCommand('loadState', null, {}, () => this.loadStateInContext(raw))
  }

  private loadStateInContext(raw: unknown): SessionResponse {
    let nextState: GameState
    let cursor: SessionPrivateCursor | null = null
    if (isStateWithCursor(raw)) {
      nextState = raw.state
      cursor = raw.sessionCursor ?? null
    } else {
      nextState = raw as GameState
    }
    this.state = rebuildActiveModifiers(normalizeState(nextState))
    this.syncDynamicActionSpaces()
    if (!this.state.roundStartSnapshot) {
      this.state.roundStartSnapshot = this.buildRoundSnapshot(this.state)
    }
    this.engineStack.clear()
    this.history = []
    this.actionStartIndex = null
    this.actionStartPlayerSnapshot = null
    this.turnOwnerPlayerIndex = null
    this.provisionalContinuationScopes = []
    this.failedAuthoritativeCommands = []
    this.nextProvisionalScopeId = 1
    if (cursor) this.restoreSessionPrivateCursor(cursor)
    return this.respond()
  }

  getStateForRead(): Readonly<GameState> {
    return this.state
  }

  private continueAfterResolvedFarmChoice(playerIndex: number): SessionResponse {
    if (!this.engine) {
      return this.respond()
    }

    const space = this.getSpaceById(this.activeSpaceId)
    const updatedPlayer = this.state.players[playerIndex]!
    if (!space) return this.respond(false, 'invalid state')
    const pendingSourceCard = this.peekPendingSourceCard()

    const result = this.engine.resolveChoice(
      'confirm',
      this.buildEngineExecutionContext(updatedPlayer, space),
    )
    this.flushEngineLog()
    if (result.type === 'ok') {
      this.recordActionResultDetails(
        result,
        this.currentFrameOwnerPlayerId(updatedPlayer.id),
        updatedPlayer.id,
        pendingSourceCard,
      )
    }

    if (result.type === 'request' && result.request.kind === 'choice') {
      // Engine wired the new pending envelope (with promptKey + promptParams);
      // no previous GameCore pending-field mirror needed (Task 10).
      return this.respond()
    }
    if (result.type === 'fail') {
      endTurnScope(updatedPlayer)
      this.engineStack.pop()
      this.actionStartIndex = null
      return this.respond()
    }

    this.runEngineSteps()
    return this.respond()
  }

  private resolveFarmSelectionChoice(
    playerIndex: number,
    payload: SelectionCommitPayload,
    pushHistoryEntry: boolean,
  ): SessionResponse {
    const view = this.engineStack.peekPendingView()
    const cursor = this.engineStack.peekPendingCursor()
    const frame = this.engineStack.current()
    const farmType = this.isFarmPromptKey(view?.promptKey)
    const pendingPlayerIndex = frame && view && cursor
      ? this.effectiveOwnerIndexForFrame(frame, cursor.hostNodeId, view)
      : -1
    if (!farmType || pendingPlayerIndex !== playerIndex) {
      return this.respond(false, 'no pending selection/resource choice for this player')
    }
    if (!this.engine) return this.respond(false, 'no active engine')
    const player = this.state.players[playerIndex]
    const space = this.getSpaceById(this.activeSpaceId)
    if (!player || !space) return this.respond(false, 'invalid state')
    const pendingSourceCard = this.peekPendingSourceCard()
    if (payload.cancel === true) {
      return this.respond(false, 'action cancel is not allowed')
    }

    let farmPayload: Record<string, unknown> | undefined
    switch (farmType) {
      case 'fence':
        farmPayload = {
          edges: payload.edges ?? [],
          palisadeEdges: payload.palisadeEdges ?? [],
          extraWood: payload.extraWood ?? 0,
          fenceSources: payload.fenceSources ?? undefined,
        }
        break
      case 'room':
        farmPayload = { rooms: payload.rooms ?? [] }
        break
      case 'stable':
        farmPayload = { stables: payload.stables ?? [], farmHand: payload.farmHand }
        break
      case 'plow':
        farmPayload = { tile: payload.tile }
        break
      case 'sow':
        farmPayload = { crops: payload.crops ?? [] }
        break
    }

    if (pushHistoryEntry) {
      this.pushHistory()
    }
    const result = this.engine.resolveChoice(
      'confirm',
      this.buildEngineExecutionContext(player, space),
      farmPayload,
    )
    this.flushEngineLog()

    if (result.type === 'request') {
      return this.respond()
    }
    if (result.type === 'fail') {
      if (result.recoverable === true) {
        return this.respond(false, result.errorKey ?? 'action failed')
      }
      endTurnScope(this.state.players[frame?.ownerPlayerIndex ?? playerIndex] ?? player)
      this.engineStack.pop()
      this.actionStartIndex = null
      this.actionStartPlayerSnapshot = null
      delete player._activeActionBonusSources
      this.turnOwnerPlayerIndex = null
      return this.respond(false, result.errorKey ?? 'action failed')
    }
    if (result.type === 'ok') {
      this.recordActionResultDetails(
        result,
        this.currentFrameOwnerPlayerId(player.id),
        player.id,
        pendingSourceCard,
      )
    }

    this.deferPrivateEventDrainDepth += 1
    try {
      this.runEngineSteps()
    } finally {
      this.deferPrivateEventDrainDepth -= 1
    }
    if (this.engineStack.peekPendingEnvelope()) return this.respond()
    return this.continueAfterResolvedFarmChoice(playerIndex)
  }

  commitSelectionChoice(
    playerIndex: number,
    payload: SelectionCommitPayload,
  ): SessionResponse {
    return this.runAuthoritativeCommand(
      'commitSelection',
      playerIndex,
      payload,
      () => this.commitSelectionChoiceInContext(playerIndex, payload),
    )
  }

  private commitSelectionChoiceInContext(
    playerIndex: number,
    payload: SelectionCommitPayload,
  ): SessionResponse {
    const envelope = this.engineStack.peekPendingEnvelope()
    const view = this.engineStack.peekPendingView()
    const cursor = this.engineStack.peekPendingCursor()
    const frame = this.engineStack.current()
    const pendingPlayerIndex = frame && view && cursor
      ? this.effectiveOwnerIndexForFrame(frame, cursor.hostNodeId, view)
      : -1
    const plan = planCommitSelectionSubmission({
      requestKind: view?.request.kind,
      isFarmPrompt: !!this.isFarmPromptKey(view?.promptKey),
      isSelectionPrompt: !!this.isSelectionPromptKey(view?.promptKey),
      pendingPlayerIndex,
      playerIndex,
      payload,
    })
    if (!plan.ok) return this.respond(false, plan.error)
    const player = this.state.players[playerIndex]
    if (!player) return this.respond(false, 'invalid player')
    const pendingSourceCard = this.peekPendingSourceCard()

    if (plan.isFarmSelection) {
      return this.resolveFarmSelectionChoice(playerIndex, payload, true)
    }

    // resource-quantity-select 分支：包装 resourceCounts 到 payload，透传到 action.resolveChoice。
    // 与 occupation-hand path `{cards: cardIds}` / farm-position path `{positions: positionStrings}` 风格一致。
    // Generic pre-validation: read availableByResource from envelope, check shape (int, >=0, <= avail)
    // and >=1 total when requireAtLeastOne. Effect-layer bounds remain inside resolveChoice as defense-in-depth.
    if (plan.isResourceQuantity && envelope && envelope.request.kind === 'resource-quantity-select') {
      const validation = validateResourceQuantityCommit({
        request: envelope.request,
        resourceCounts: payload.resourceCounts,
      })
      if (!validation.ok) return this.respond(false, validation.error)
      const counts = validation.counts
      this.pushHistory()
      const space = this.getSpaceById(this.activeSpaceId!) ?? this.createSyntheticSpace('resource-quantity')
      const result = this.engine?.resolveChoice('confirm', {
        ...this.buildEngineExecutionContext(player, space),
      }, { resourceCounts: counts })
      // Effect 校验失败应直接 respond(false)，pending envelope 保留，让前端再次提交合法选择。
      if (result?.type === 'fail') {
        this.flushEngineLog()
        return this.respond(false, result.errorKey ?? 'invalid resource-quantity selection')
      }
      // 与 occupation-hand 分支保持一致（line 3384）：只 record ok 结果。
      if (result?.type === 'ok') {
        this.recordActionResultDetails(
          result,
          this.currentFrameOwnerPlayerId(player.id),
          player.id,
          pendingSourceCard,
        )
      }
      this.flushEngineLog()
      this.runEngineSteps()
      if (this.engineStack.peekPendingEnvelope()) return this.respond()
      return this.continueAfterResolvedFarmChoice(playerIndex)
    }

    if (plan.isResourceBatchExchange && envelope && envelope.request.kind === 'resource-batch-exchange-select') {
      const validation = validateResourceBatchExchangeCommit({
        request: envelope.request,
        resourceBatchExchange: payload.resourceBatchExchange,
      })
      if (!validation.ok) return this.respond(false, validation.error)
      const batch = validation.batch
      this.pushHistory()
      const space = this.getSpaceById(this.activeSpaceId!) ?? this.createSyntheticSpace('resource-batch-exchange')
      const result = this.engine?.resolveChoice('confirm', {
        ...this.buildEngineExecutionContext(player, space),
      }, { resourceBatchExchange: batch })
      if (result?.type === 'fail') {
        this.flushEngineLog()
        return this.respond(false, result.errorKey ?? 'invalid resource batch exchange')
      }
      if (result?.type === 'ok') {
        this.recordActionResultDetails(
          result,
          this.currentFrameOwnerPlayerId(player.id),
          player.id,
          pendingSourceCard,
        )
      }
      this.flushEngineLog()
      this.runEngineSteps()
      if (this.engineStack.peekPendingEnvelope()) return this.respond()
      return this.continueAfterResolvedFarmChoice(playerIndex)
    }

    const interactionContext = this.peekHostContextSnapshot()?.actionContext
    const selectionKind = (interactionContext?.selectionKind as string | undefined) ?? 'farm-position'
    const maxSelections = (interactionContext?.maxSelections as number) ?? 1
    const minSelections = (interactionContext?.minSelections as number) ?? 1

    // occupation-hand: validate card IDs
    if (selectionKind === 'occupation-hand') {
      const cardIds = payload.cardIds ?? []
      const validation = validateOccupationHandCommit({
        player,
        cardIds,
        minSelections,
        maxSelections,
      })
      if (!validation.ok) return this.respond(false, validation.error)
      this.pushHistory()
      // S2 Task 7: forward structured payload via engine.resolveChoice's
      // `payload` arg; selection.resolveChoice now reads `payload.cards` first
      // and only splits the previous comma-joined `cardIds` choice string
      // when payload is absent.
      const space = this.getSpaceById(this.activeSpaceId!) ?? this.createSyntheticSpace('selection')
      const result = this.engine?.resolveChoice('confirm', {
        ...this.buildEngineExecutionContext(this.state.players[playerIndex]!, space),
      }, { cards: cardIds })
      if (result?.type === 'ok') {
        this.recordActionResultDetails(
          result,
          this.currentFrameOwnerPlayerId(player.id),
          player.id,
          pendingSourceCard,
        )
      }
      this.flushEngineLog()
      this.runEngineSteps()
      if (this.engineStack.peekPendingEnvelope()) return this.respond()
      return this.continueAfterResolvedFarmChoice(playerIndex)
    }

    // farm-position (default)
    const positions = payload.positions ?? []
    const validation = validateFarmPositionCommit({
      state: this.state,
      player,
      positions,
      actionContext: interactionContext,
      pendingSourceCard,
      minSelections,
      maxSelections,
    })
    if (!validation.ok) return this.respond(false, validation.error)

    this.pushHistory()
    const space = this.getSpaceById(this.activeSpaceId!) ?? this.createSyntheticSpace('selection')
    const result = this.engine?.resolveChoice('confirm', {
      ...this.buildEngineExecutionContext(this.state.players[playerIndex]!, space),
    }, { positions: validation.positionStrings })
    if (result?.type === 'ok') {
      this.recordActionResultDetails(
        result,
        this.currentFrameOwnerPlayerId(player.id),
        player.id,
        pendingSourceCard,
      )
    }
    this.flushEngineLog()
    this.runEngineSteps()
    if (this.engineStack.peekPendingEnvelope()) return this.respond()
    return this.continueAfterResolvedFarmChoice(playerIndex)
  }

  devSetResources(playerIndex: number, resources: Record<string, number>): SessionResponse {
    return this.runAuthoritativeCommand(
      'devSetResources',
      playerIndex,
      resources,
      () => this.devSetResourcesInContext(playerIndex, resources),
    )
  }

  private devSetResourcesInContext(playerIndex: number, resources: Record<string, number>): SessionResponse {
    const player = this.state.players[playerIndex]
    if (!player) return this.respond(false, 'player not found')
    const animalKeys = new Set(animalKeysForState(this.state))
    let increasedAnimals = false
    Object.entries(resources).forEach(([key, value]) => {
      if (typeof value === 'number') {
        const resourceBag = player.resources as Record<string, number>
        const priorValue = resourceBag[key] ?? 0
        resourceBag[key] = value
        if (animalKeys.has(key as AnimalKey) && value > priorValue) increasedAnimals = true
      }
    })
    if (increasedAnimals) {
      this.startTopLevelReorganizeFlow(playerIndex)
    }
    return this.respond()
  }

  devSetRound(round: number): SessionResponse {
    return this.runAuthoritativeCommand('devSetRound', null, { round }, () => {
      this.state.round = round
      return this.respond()
    })
  }

  devSetCurrentPlayer(playerIndex: number): SessionResponse {
    return this.runAuthoritativeCommand('devSetCurrentPlayer', playerIndex, {}, () => {
      if (playerIndex < 0 || playerIndex >= this.state.players.length) {
        return this.respond(false, 'invalid player index')
      }
      this.state.currentPlayerIndex = playerIndex
      return this.respond()
    })
  }

  private isOccupationCard(cardId: string): boolean {
    // Built-in cards: [A-E]NNN_ pattern, check if it's NOT a minor improvement
    if (cardId.match(/^[A-E]\d+_/)) return !getMinorImprovement(cardId)
    // Custom cards: check session card context
    if (this.sessionCardContext) {
      if (this.sessionCardContext.getCustomOccupation(cardId)) return true
      if (this.sessionCardContext.getCustomMinor(cardId)) return false
    }
    return false
  }

  private clearDevCardState(player: PlayerState, cardId: string): void {
    player.minorHand = player.minorHand.filter(id => id !== cardId)
    player.occupationHand = player.occupationHand.filter(id => id !== cardId)
    player.minorPlayed = player.minorPlayed.filter(id => id !== cardId)
    player.occupationPlayed = player.occupationPlayed.filter(id => id !== cardId)
    player.improvements = player.improvements.filter(id => id !== cardId)
    player.extraOccupationsFromCards = (player.extraOccupationsFromCards ?? []).filter(id => id !== cardId)
    player.activeModifiers = (player.activeModifiers ?? []).filter(modifier => modifier.cardId !== cardId)
    player.playedCards = (player.playedCards ?? []).filter(
      id => id !== cardId && id !== `minor:${cardId}` && id !== `occupation:${cardId}` && id !== `major:${cardId}`,
    )
    if (player.cardStates?.[cardId]) {
      delete player.cardStates[cardId]
    }
  }

  private clearDevDynamicActionSpace(cardId: string): void {
    if (!getPlayerActionSpaceConfig(cardId)) return
    this.state.actionSpaces = this.state.actionSpaces.filter(space => space.id !== cardId)
  }

  devDrawCard(playerIndex: number, cardIdInput: string): SessionResponse {
    return this.runAuthoritativeCommand(
      'devDrawCard',
      playerIndex,
      { cardId: cardIdInput },
      () => this.devDrawCardInContext(playerIndex, cardIdInput),
    )
  }

  private devDrawCardInContext(playerIndex: number, cardIdInput: string): SessionResponse {
    const player = this.state.players[playerIndex]
    if (!player) return this.respond(false, 'player not found')
    const cardId = resolveDevCardIdInput(cardIdInput)
    const isMajor = !!getMajorCard(cardId)
    const isOccupation = !isMajor && this.isOccupationCard(cardId)
    for (const p of this.state.players) {
      this.clearDevCardState(p, cardId)
    }
    this.clearDevDynamicActionSpace(cardId)
    if (isMajor) {
      returnMajorImprovementToSupply(this.state, cardId)
    } else if (isOccupation) {
      player.occupationHand.push(cardId)
    } else {
      player.minorHand.push(cardId)
    }
    if (!isMajor) {
      this.reportProtectedObservation({
        kind: 'hidden-information',
        recipientPlayerIds: [player.id],
      })
    }
    const events = isMajor ? [] : [
      {
        schemaVersion: 1 as const,
        type: 'private.handChanged' as const,
        recipientPlayerId: player.id,
        cardIds: [cardId],
        cardType: isOccupation ? 'occupation' as const : 'minor' as const,
        reason: 'dev-draw-card' as const,
      },
    ]
    return this.respond(true, undefined, events)
  }

  devPlayCard(playerIndex: number, cardIdInput: string): SessionResponse {
    return this.runAuthoritativeCommand(
      'devPlayCard',
      playerIndex,
      { cardId: cardIdInput },
      () => this.devPlayCardInContext(playerIndex, cardIdInput),
    )
  }

  private devPlayCardInContext(playerIndex: number, cardIdInput: string): SessionResponse {
    const player = this.state.players[playerIndex]
    if (!player) return this.respond(false, 'player not found')
    const cardId = resolveDevCardIdInput(cardIdInput)
    const isMajor = !!getMajorCard(cardId)
    const isOccupation = this.isOccupationCard(cardId)
    for (const p of this.state.players) {
      this.clearDevCardState(p, cardId)
    }
    this.clearDevDynamicActionSpace(cardId)
    if (isMajor) {
      player.improvements.push(cardId)
      takeMajorImprovementFromSupply(this.state, cardId)
    } else if (isOccupation) {
      player.occupationPlayed.push(cardId)
    } else {
      player.minorPlayed.push(cardId)
      if (getMinorImprovement(cardId)?.providesOccupation) {
        player.extraOccupationsFromCards = player.extraOccupationsFromCards ?? []
        player.extraOccupationsFromCards.push(cardId)
      }
    }
    getCardModifiers(cardId).forEach((modifier) => {
      if (!player.activeModifiers.some((m) => JSON.stringify(m) === JSON.stringify(modifier))) {
        player.activeModifiers.push(modifier)
      }
    })
    // Trigger onBuy hook (creates PlayerActionCard action spaces, etc.)
    runCardEffectHook(this.state, player, cardId, 'onBuy', undefined, {
      reportProtectedObservation: (observation) => this.reportProtectedObservation(observation),
    })
    this.syncDynamicActionSpaces()
    const dynamicSpace = findActionSpaceById(this.state, cardId)
    if (dynamicSpace && getPlayerActionSpaceConfig(cardId)) {
      this.registry.register(dynamicSpace)
    }
    return this.respond()
  }

  devSetSpaceTaken(spaceId: string, playerId: string | null): SessionResponse {
    return this.runAuthoritativeCommand(
      'devSetSpaceTaken',
      playerId ? this.state.players.findIndex((player) => player.id === playerId) : null,
      { spaceId, playerId },
      () => this.devSetSpaceTakenInContext(spaceId, playerId),
    )
  }

  private devSetSpaceTakenInContext(spaceId: string, playerId: string | null): SessionResponse {
    const space = findActionSpaceById(this.state, spaceId)
    if (!space) return this.respond(false, 'space not found')
    if (!playerId) {
      space.takenBy = []
      space.blockedBy = []
    } else {
      const player = findPlayerById(this.state, playerId)
      const worker = player ? smallestAvailableWorker(this.state, player) : null
      space.takenBy = [{ playerId, workerId: worker?.id ?? '1' }]
    }
    return this.respond()
  }

  devAddRooms(playerIndex: number, rooms: FarmTilePosition[]): SessionResponse {
    return this.runAuthoritativeCommand(
      'devAddRooms',
      playerIndex,
      { rooms },
      () => this.devAddRoomsInContext(playerIndex, rooms),
    )
  }

  private devAddRoomsInContext(playerIndex: number, rooms: FarmTilePosition[]): SessionResponse {
    const player = this.state.players[playerIndex]
    if (!player) return this.respond(false, 'player not found')
    player.roomTiles = [...player.roomTiles, ...rooms]
    player.rooms = (player.rooms || 0) + rooms.length
    return this.respond()
  }

  undoStep(): SessionResponse {
    return this.runAuthoritativeCommand('undoStep', null, {}, () => this.undoStepInContext())
  }

  private undoStepInContext(): SessionResponse {
    if (this.state.gameOver) return this.respond(false, 'game is over')
    const view = this.engineStack.peekPendingView()
    const interactionFrame = this.engineStack.current()
    // Farm-select kind carries the same promptKey shape as the previous
    // choice farm prompts, so the history-restore undo path applies to both.
    const isPlainChoiceOrFarmSelect =
      view &&
      (view.request.kind === 'choice' ||
        view.request.kind === 'farm-select')
    const farmPrompt = isPlainChoiceOrFarmSelect ? this.isFarmPromptKey(view.promptKey) : null
    if (isPlainChoiceOrFarmSelect && farmPrompt && interactionFrame) {
      const entry = this.history[this.history.length - 1]
      const canRestorePriorChoice =
        !!entry &&
        entry.undoBoundary !== true &&
        entry.activeSpaceId === this.activeSpaceId &&
        entry.activePlayerIndex === this.activePlayerIndex &&
        entry.hadChoicePending
      if (canRestorePriorChoice) {
        const beforeEvents = [...this.state.events]
        const beforeArchive = this.capturePublicEventArchive()
        const cancellationPlan = this.preparePublicEventCancellation(
          'undoStep',
          beforeEvents,
          entry.state.events,
          beforeArchive,
        )
        this.history.pop()
        this.restoreHistory(entry)
        this.recomputeActionStartIndex()
        this.restorePendingExtraTurnAfterUndo()
        return this.applyPreparedPublicEventCancellation(beforeArchive, cancellationPlan)
      }
      if (entry && this.engineStack.hasPendingChoiceCompositeAncestor()) {
        const beforeEvents = [...this.state.events]
        const beforeArchive = this.capturePublicEventArchive()
        const cancellationPlan = this.preparePublicEventCancellation(
          'undoStep',
          beforeEvents,
          entry.state.events,
          beforeArchive,
        )
        this.history.pop()
        this.restoreHistory(entry)
        this.recomputeActionStartIndex()
        this.restorePendingExtraTurnAfterUndo()
        return this.applyPreparedPublicEventCancellation(beforeArchive, cancellationPlan)
      }
    }
    // Task 0.6 introduced `state.pendingUndoBoundary` to signal an undo-blocker from a
    // card's handler (e.g. after rolling random). pushHistory consumes the flag and marks
    // the next history entry. But between the roll and the next pushHistory, the flag
    // lives only on state. Honor it directly here so undo cannot cross the roll even in
    // that window.
    if (this.state.pendingUndoBoundary === true) {
      return this.respond(false, 'cannot undo past boundary')
    }
    if (this.history.length > 0 && this.history[this.history.length - 1]?.undoBoundary) {
      return this.respond(false, 'cannot undo past boundary')
    }
    const entry = this.history[this.history.length - 1]
    if (!entry) return this.respond(false, 'no history to undo')
    const beforeEvents = [...this.state.events]
    const beforeArchive = this.capturePublicEventArchive()
    const cancellationPlan = this.preparePublicEventCancellation(
      'undoStep',
      beforeEvents,
      entry.state.events,
      beforeArchive,
    )
    this.history.pop()
    this.restoreHistory(entry)
    this.recomputeActionStartIndex()
    this.restorePendingExtraTurnAfterUndo()
    return this.applyPreparedPublicEventCancellation(beforeArchive, cancellationPlan)
  }

  undoAction(): SessionResponse {
    return this.runAuthoritativeCommand('undoAction', null, {}, () => this.undoActionInContext())
  }

  private undoActionInContext(): SessionResponse {
    if (this.state.gameOver) return this.respond(false, 'game is over')
    if (!this.canUndoActionNow()) {
      if (
        this.state.pendingUndoBoundary === true ||
        (this.actionStartIndex !== null && this.latestUndoBoundaryIndex() > this.actionStartIndex)
      ) {
        return this.respond(false, 'cannot undo past boundary')
      }
      return this.respond(false, 'no action snapshot')
    }
    const targetIndex = this.actionStartIndex
    if (targetIndex === null) return this.respond(false, 'no action snapshot')
    const entry = this.history[targetIndex]
    if (!entry) return this.respond(false, 'no action snapshot')
    const beforeEvents = [...this.state.events]
    const beforeArchive = this.capturePublicEventArchive()
    const cancellationPlan = this.preparePublicEventCancellation(
      'undoAction',
      beforeEvents,
      entry.state.events,
      beforeArchive,
    )
    this.restoreHistory(entry)
    this.history = this.history.slice(0, targetIndex)
    this.actionStartIndex = null
    this.restorePendingExtraTurnAfterUndo()
    return this.applyPreparedPublicEventCancellation(beforeArchive, cancellationPlan)
  }
}
