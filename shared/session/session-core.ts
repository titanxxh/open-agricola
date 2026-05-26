import type {
  DraftGameEvent,
  EventSink,
} from '../contract/events.ts'
import type {
  ActionChoiceOption,
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
  PlayerState,
  Resource,
  ResourceBatchExchangePayload,
  InteractionAnimalReorgZone,
  ExactCost,
} from '../contract/types.ts'
import type { ActionDetailParts, PublicEventCancellation } from '../contract/protocol/game.ts'
import type { PrivateGameEvent } from '../contract/private-events.ts'
import { actionDefinitions, getActionDefinition } from '../actions/index.ts'
import { internalActionDefinitions } from '../actions/internal-actions.ts'
import { getAllAdHocActions } from '../actions/helpers/ad-hoc-action-registry.ts'
import { clearActionHooks } from '../actions/hooks.ts'
import { finalizeDraft } from '../draft/draft-manager.ts'
import type { DraftPickPayload } from '../draft/types.ts'
import {
  ActionNode,
  ActionRegistry,
  EngineStack,
  INTERACTION_ONLY_ACTION_ID,
  Engine,
  EngineTree,
  HookDispatcher,
  LogStore,
  OrNode,
  ParallelNode,
  SequenceNode,
  XorNode,
  isSyntheticInteractionFrame,
} from '../engine/index.ts'
import { isInjectedAnytimeResult } from '../engine/action-context-flags.ts'
import type { EngineFrame, EngineNode, EngineSource, EngineStackCursor, SubFlowReason } from '../engine/index.ts'
import {
  isPendingChoiceValueAllowed,
  pendingEnvelopeChoices,
} from '../engine/pending-validation.ts'
import { isProtectedActionCancel } from '../engine/protected-action-cancel.ts'
import type { PendingEnvelope } from '../engine/types.ts'
import type { ReorganizeTrigger } from '../actions/effects/reorganize.ts'
import {
  createInitialState,
  createRoundOpenById,
  cloneState,
  emptyResources,
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
import {
  registerCustomCard,
  getCustomMinorImprovementIds,
  getCustomOccupationIds,
} from '../cards/custom-registry.ts'
import { type CustomCardData, SessionCardContext, withSessionContext } from '../cards/session-card-context.ts'
import { CardRegistry, type CardImpl } from '../cards/registry.ts'
import { getActiveCardRegistry, setActiveCardRegistry } from '../cards/active-registry.ts'
import { ensureCatalogLookupsInstalled } from '../cards/install-catalog-lookups.ts'
import { ALL_CARD_IMPLS } from '../cards/register-all.ts'
import { allOccupationCards, allMinorImprovementCards } from '../cards/catalog.ts'
import { majorCardDefinitions } from '../cards/major/index.ts'
import * as setupPhase from './phases/setup.ts'
import * as roundPhase from './phases/round.ts'
import * as harvestPhase from './phases/harvest.ts'
import * as draftPhase from './phases/draft.ts'
import { getCardModifiers } from '../cards/card-modifiers.ts'
import { getCardEffect } from '../cards/card-effects.ts'
import type { CardEffectHook } from '../cards/card-effects.ts'
import { runBeforeFeedHooks, runAfterFeedHooks, runCardEffectHook, runBeforeEndGameHooks } from '../cards/card-effects.ts'
import { positionKey } from '../domain/farm.ts'
import { getMatchingListeners, executeCardListener } from '../cards/card-listeners.ts'
import { buildPhaseTrailingNodes, markOptional, stampOwner } from '../engine/engine-utils.ts'
import { Scoring, playerBoard, type PlayerScoreSummary } from '../domain'
import { reap } from '../actions/effects/reap.ts'
import { breedLeaf } from '../actions/effects/breed'
import { releaseWorkerFromCard } from '../cards/helpers/card-held-workers.ts'
import { resetRoundPlacements } from '../cards/helpers/round-placement.ts'
import { familySize, newbornCount, workersAvailable } from '../domain/player.ts'
import { getAssignedAnimalCount } from '../domain/animals.ts'
import { getRegisteredMinorImprovement, getRegisteredOccupation } from '../cards/registry-display'
import { getExchangesInWindow } from '../actions/effects/exchange.ts'
import { getMajorCard } from '../cards/major/index.ts'
import {
  BASIC_CONVERSION_SOURCE_ID,
  getBasicConversionExchange,
} from '../cards/basic-conversion.ts'
import { appendImmediateEvents, type ImmediateEventDraft } from '../events/append.ts'
import { prependDerivedLogEntries } from '../events/log-cache.ts'
import {
  appendPublicEventCanceledPacket,
  assertPublicEventArchiveCanAppend,
  PublicEventArchivePayloadError,
} from '../events/archive.ts'
import {
  applyTradeSideEffect,
} from '../actions/payment/internal'
import {
  isMajorImprovementPlayable,
  isMinorImprovementPlayable,
} from '../actions/effects/improvement.ts'
import { isBlockedByMajorImprovementActionGate } from '../actions/helpers/improvement-helpers'
import {
  getOccupationActionCost,
  isOccupationPlayable,
} from '../actions/effects/occupation.ts'
import {
  getFenceCount,
  getPalisadeCount,
} from '../actions/effects/fencing.ts'
import { rebuildActiveModifiers } from '../session/serialization.ts'
import { isSpaceOccupied, removeWorkerRef } from '../domain/space.ts'
import { smallestAvailableWorker } from '../domain/player.ts'
import {
  canEnterSpace,
  computeAllowedPlacementSpaces,
} from '../actions/helpers/placement-availability.ts'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../actions/helpers/placement-constants.ts'
import {
  computeAnytimePolicy,
  type AnytimePolicy,
  type AnytimePolicyInput,
} from './anytime-policy'

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
  sourceCard?: string
  actionContext?: Record<string, unknown>
}

const pendingContextSnapshot = (
  envelope: PendingEnvelope | null,
): PendingContextSnapshot | null => {
  const snapshot = envelope?.contextSnapshot
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

/**
 * Selection payload sent by the client to resolve a pending `harvestFeed`
 * interaction. Each entry references one row of `card.exchanges[]` via
 * `(sourceId, exchangeIndex)`; `count` is the requested number of times to
 * apply the exchange (subject to per-card `max` capping).
 */
export type FeedSelection = {
  count: number
  sourceName?: string
  sourceId: string
  /** Entry-index pointer into card.exchanges[] (D3 unified path). */
  exchangeIndex: number
}
export type FeedSelections = FeedSelection[]

type SowSelectionPayload = {
  row: number
  col: number
  crop: 'grain' | 'vegetable' | 'wood' | 'stone'
}

type SelectionCommitPayload = {
  cancel?: boolean
  positions?: FarmTilePosition[]
  cardIds?: string[]
  resourceCounts?: Partial<Record<keyof Resource, number>>
  resourceBatchExchange?: ResourceBatchExchangePayload
  edges?: string[]
  palisadeEdges?: string[]
  extraWood?: number
  rooms?: FarmTilePosition[]
  stables?: FarmTilePosition[]
  tile?: FarmTilePosition
  crops?: SowSelectionPayload[]
}

type HistoryEntry = {
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
  turnOwnerPlayerIndex: number | null
  actionStart: boolean
  undoBoundary?: boolean
}

type StageResumeState = {
  hook:
    | 'onBeforeHarvest'
    | 'onAfterReap'
    | 'onHarvest'
    | 'onEndHarvest'
    | 'onAfterHarvest'
    | 'onBeforeStartOfTurn'
    | 'onRoundStart'
    | 'onStartHarvestFeedingPhase'
    | 'onEndTurn'
    | 'onReturnHome'
    | 'onStartReturnHome'
    | 'onAfterRoundEnd'
    | 'onStartHarvest'
    | 'onStartHarvestFieldPhase'
    | 'onHarvestFieldPhase'
    | 'onEndHarvestFieldPhase'
    | 'onHarvestFeedingPhase'
    | 'onEndHarvestFeedingPhase'
    | 'onBeforeReturnHome'
    | 'onAllWorkersPlaced'
    | 'onBreedPhase'
    | 'onReorganizeComplete'
  playerIndex: number
  cardIndex: number
  extra?: {
    trigger?: import('../actions/effects/reorganize').ReorganizeTrigger
    originPlayerIndex?: number | null
  }
}

export type SessionResponse = {
  ok: boolean
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
  engineStackCursor: EngineStackCursor
}

const isStateWithCursor = (value: unknown): value is StateWithCursor => {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    'state' in v &&
    'engineStackCursor' in v &&
    typeof v.state === 'object' &&
    v.state !== null &&
    typeof v.engineStackCursor === 'object' &&
    v.engineStackCursor !== null &&
    Array.isArray((v.engineStackCursor as { frames?: unknown }).frames)
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
   * Monotonic counter for two purposes:
   *   1. `recordActionSnapshot(player, n)` — per-player action token used by
   *      undo/replay to label whose turn produced each player snapshot.
   *   2. `nextSyntheticNodeId(prefix)` — generates `${prefix}-${n}` ids for
   *      synthetic pending frames (`startConfirmNextPlayer` etc.).
   *
   * Cursor restore: the pending envelope carries the original
   * synthetic id (e.g. `interaction:feed-7`); after `loadState` the freshly-
   * constructed `GameCore` resets `nextActionToken` to 1, so the next
   * `startConfirm*` call mints `interaction:confirm-next-player-1`.
   * Collisions on synthetic *node ids* are impossible because each id lives
   * on a separate `Engine` instance (one per stack frame) and
   * synthetic frames are isolated engine instances.
   *
   * Caveat (Task 10 S-2 / Task 11 carry-over): the same counter also stamps
   * per-player action snapshots (`recordActionSnapshot(player, token)`).
   * Those tokens persist into `player.actionSnapshots` and survive
   * serialize/rehydrate; a cold-restart `GameCore` will start emitting fresh
   * tokens from `1` again, so post-restart snapshot tokens are not globally
   * monotonic across the session boundary. Today the only consumers compare
   * tokens within a single session run (undo/replay within one process), so
   * the restart is benign — but if any future feature wants a stable
   * "this happened before that" ordering across restarts, the counter will
   * need to ride the cursor (or be derived from `max(actionSnapshots) + 1`
   * during rehydrate). Logged here so the next change-author sees the gap.
   */
  private nextActionToken = 1
  private turnOwnerPlayerIndex: number | null = null

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
  driveEngineSteps(): void { this.runEngineSteps() }

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
  startReorgSubFlow(playerIndex: number, trigger: ReorganizeTrigger, options?: { originPlayerIndex?: number }): void {
    this.startReorganizeSubFlow(playerIndex, trigger, options)
  }
  /** @internal phase access — synthetic pending id generator. */
  mintSyntheticNodeId(prefix: string): string { return this.nextSyntheticNodeId(prefix) }
  /** @internal phase access — Round phase listenersVetoIsDoable check. */
  listenersVetoIsDoableCheck(player: PlayerState, space: ActionSpace): boolean {
    return this.listenersVetoIsDoable(player, space)
  }
  /** @internal Harvest phase trampoline — kicks off the beforeHarvest stage hook chain. */
  invokeHarvestFromBeforeHarvest(): SessionResponse { return this.continueHarvestFromBeforeHarvest() }
  /** @internal Harvest phase trampoline — kicks off the breed-phase continuation chain. */
  invokeAfterFeedingPhase(): SessionResponse { return this.continueAfterFeedingPhase() }
  /** @internal Round phase trampoline — onAllWorkersPlaced + performRoundEnd cascade. */
  invokeAllWorkersPlacedHooks(): SessionResponse { return this.continueAllWorkersPlacedHooks() }
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
    const envelope = this.engineStack.peekPendingEnvelope()
    const promptKey = envelope?.promptKey
    const request = envelope?.request
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
  invokeEndTurnHooks(playerIndex: number): SessionResponse { return this.continueEndTurnHooks(playerIndex) }
  /** @internal Harvest phase — read the harvestRounds set (for returning-home decision). */
  isHarvestRound(round: number): boolean { return harvestRounds.includes(round) }
  /** @internal Harvest phase — find next player still owing a harvest-breed reorg. */
  findNextHarvestReorgPlayerIndex(playerIndex: number): number { return this.findNextHarvestReorgPlayer(playerIndex) }
  /** @internal Harvest phase — onEndHarvest stage hook chain trampoline. */
  invokeEndHarvestEffects(): SessionResponse { return this.continueEndHarvestEffects() }
  /** @internal Draft phase — assign processed draft state back. */
  setDraftState(draft: GameState['draft']): void { this.state.draft = draft }
  /** @internal Draft phase — finalize the draft (copies kept piles back to hands). */
  applyDraftFinalize(): void {
    this.state = finalizeDraft(this.state)
    // Refresh round-start snapshot so that subsequent takeAction / undo logic
    // sees the post-draft hands rather than the initial empty-handed snapshot.
    this.state.roundStartSnapshot = this.buildRoundSnapshot(this.state)
  }
  /** @internal Round phase — read the captured pre-action player snapshot. */
  getActionStartPlayerSnapshot(): PlayerState | null { return this.actionStartPlayerSnapshot }
  /** @internal Round phase — emit `log.actionDetail`. */
  invokeLogActionDetail(before: PlayerState, after: PlayerState): void { this.logActionDetail(before, after) }
  /** @internal Round phase — onBeforeReturnHome stage hook chain trampoline. */
  invokeBeforeReturnHomeHooks(): SessionResponse { return this.continueBeforeReturnHomeHooks() }
  /** @internal Round phase — onAfterRoundEnd stage hook chain trampoline. */
  invokeAfterRoundEnd(): SessionResponse { return this.continueAfterRoundEnd() }
  /** @internal phase access — build a fresh Engine for a top-level action space. */
  createEngineForSpace(actionId: string): Engine { return this.createEngine(actionId) }
  /** @internal phase access — push a synthetic pending-only frame. */
  pushSyntheticPendingFrame(envelope: PendingEnvelope, ownerPlayerIndex: number, reason: SubFlowReason): void {
    this.pushPendingFrame(envelope, ownerPlayerIndex, reason)
  }

  private registry: ActionRegistry
  private hookDispatcher: HookDispatcher
  private engineLog: LogStore
  private sessionCardContext: SessionCardContext | null = null
  private readonly registerCustomCardImpl: (data: CustomCardData) => void
  private readonly cardRegistry: CardRegistry
  readonly cardWarnings: string[] = []

  constructor(options: GameCoreOptions = {}) {
    ensureCatalogLookupsInstalled()
    const { stateOrSeed, customCards, initialStateOptions, registerCustomCardImpl } = options
    this.registerCustomCardImpl = registerCustomCardImpl ?? (() => {
      // No-op default: used in sandbox mode (browser) or tests that don't need
      // the server-side executor-backed registrar.
    })
    this.registry = new ActionRegistry()
    actionDefinitions.forEach((a) => this.registry.register(a))
    internalActionDefinitions.forEach((a) => this.registry.register(a))
    getAllAdHocActions().forEach((a) => this.registry.register(a))
    clearActionHooks()
    this.hookDispatcher = new HookDispatcher()
    this.engineLog = new LogStore()

    // Build or accept a per-session card registry, then publish it as the
    // "active" registry so any subsequent `registerCardListener` /
    // `registerCardEffect` calls (e.g. from custom-code cards) forward into it.
    //
    // If an active registry already exists (e.g. test harness with
    // pre-registered stub listeners / effects), clone it so those entries
    // survive into the session without leaking mutations back to the outer
    // registry. Fall back to a fresh registry loaded with ALL_CARD_IMPLS
    // when no outer registry is active (production startup path).
    if (options.cardRegistry) {
      this.cardRegistry = options.cardRegistry
    } else {
      const existing = getActiveCardRegistry()
      if (existing) {
        this.cardRegistry = existing.clone()
      } else {
        this.cardRegistry = new CardRegistry()
        for (const [cardId, impl] of Object.entries(ALL_CARD_IMPLS)) {
          this.cardRegistry.loadImpl(cardId, impl as CardImpl)
        }
      }
    }
    // Sync modifier definitions from catalog into per-session registry.
    // Replaces the former card-modifiers.ts catalog-direct-query path; downstream
    // callers (`getCardModifiers`) read from `active.getModifiers` only.
    this.cardRegistry.syncModifiersFromCatalog(
      allOccupationCards,
      allMinorImprovementCards,
    )
    // Register majors as effect bundles so getCardEffect resolves them after
    // the older getMajorCardEffect path is removed.
    this.cardRegistry.registerEffects(majorCardDefinitions)
    setActiveCardRegistry(this.cardRegistry)

    // Register custom workshop cards into a per-session context (sandbox mode)
    if (customCards && customCards.length > 0) {
      this.sessionCardContext = new SessionCardContext()
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
        this.restoreEngineStackFromCursor(stateOrSeed.engineStackCursor)
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
  }

  /**
   * Read-only access to the EngineStack so that the serialization layer can
   * call `engineStack.toCursor()` when persisting the session. All writes
   * still go through GameCore's existing engineStack.push/pop sites.
   */
  getEngineStack(): EngineStack {
    return this.engineStack
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
    return withSessionContext(this.sessionCardContext, fn)
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
    setupPhase.updatePlayerName(this.state.players[playerIndex], name)
  }

  private buildEngineNode(
    flow: ActionFlow,
    counter: { value: number },
    ownerPlayerId?: string,
  ): EngineNode {
    if (flow.targetPlayerId) {
      const { targetPlayerId, ...innerFlow } = flow
      const scopedNode = this.buildEngineNode(innerFlow as ActionFlow, counter, ownerPlayerId)
      return stampOwner(scopedNode, targetPlayerId)
    }
    if (flow.type === 'leaf') {
      const actionNode = new ActionNode(
        `action-${flow.actionId}-${counter.value++}`,
        flow.actionId,
        flow.sourceCard,
        flow.params,
        flow.choiceLabelKey,
        flow.choiceLabelParams,
        flow.actionContext,
      )
      const def = this.registry.get(flow.actionId)
      if (def?.resolveChoice && !def.skipChoiceWrap) {
        const seq = new SequenceNode(`seq-${flow.actionId}-${counter.value++}`, [
          actionNode,
        ])
        return flow.optional ? markOptional(seq, flow.promptKey) : seq
      }
      return flow.optional ? markOptional(actionNode, flow.promptKey) : actionNode
    }

    const children = flow.children.map((child) => this.buildEngineNode(child, counter, ownerPlayerId))
    if (flow.type === 'seq') {
      const seq = new SequenceNode(`seq-${counter.value++}`, children)
      return flow.optional ? markOptional(seq, flow.promptKey) : seq
    }
    if (flow.type === 'parallel') {
      const parallel = new ParallelNode(`par-${counter.value++}`, children)
      return flow.optional ? markOptional(parallel, flow.promptKey) : parallel
    }
    if (flow.type === 'xor') {
      const xor = new XorNode(`xor-${counter.value++}`, children, flow.promptKey)
      return flow.optional ? markOptional(xor, flow.promptKey) : xor
    }
    const or = new OrNode(`or-${counter.value++}`, children, flow.promptKey)
    return flow.optional ? markOptional(or, flow.promptKey) : or
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

    // Build a placeholder Engine so buildPhaseTrailingNodes has EngineInternals
    // (it needs counterRef for unique node ids + tree.insertAfter for nested
    // PARALLEL inserts). The placeholder root is replaced with the dispatched
    // nodes below.
    const placeholderRoot = new SequenceNode('pf-after-root-0', [])
    const stagingEngine = new Engine({
      tree: new EngineTree(placeholderRoot),
      registry: this.registry,
      hooks: this.hookDispatcher,
      log: this.engineLog,
    })
    const internals = stagingEngine._internals()

    const nodes = buildPhaseTrailingNodes(
      internals,
      matched,
      'after',
      'place-farmer',
      this.state,
      {},
      context.player.id,
    )
    if (nodes.length === 0) return false

    // Wrap the dispatched nodes in play order. Listener activation side
    // effects (incCardUsed, logs, follow-up flows) are handled by
    // engine-proceed when each internal activation leaf executes.
    const root = nodes.length === 1 ? nodes[0] : new SequenceNode(`pf-after-seq`, nodes)
    const newEngine = new Engine({
      tree: new EngineTree(root),
      registry: this.registry,
      hooks: this.hookDispatcher,
      log: this.engineLog,
    })
    const frame = this.engineStack.current()
    if (!frame) return false
    frame.engine = newEngine
    frame.source = { kind: 'flow', flow: { type: 'seq', children: [] } }
    return true
  }

  private createFlowEngine(
    flow: ActionFlow,
    ownerPlayerIndex = this.activePlayerIndex ?? this.state.currentPlayerIndex,
  ): Engine {
    const counter = { value: 0 }
    const ownerPlayerId = this.state.players[ownerPlayerIndex]?.id
    return new Engine({
      tree: new EngineTree(this.buildEngineNode(flow, counter, ownerPlayerId)),
      registry: this.registry,
      hooks: this.hookDispatcher,
      log: this.engineLog,
    })
  }

  private startReorganizeSubFlow(
    playerIndex: number,
    trigger: import('../actions/effects/reorganize').ReorganizeTrigger,
    resumeExtra: { originPlayerIndex?: number | null } = {},
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
        extra: { trigger, originPlayerIndex: resumeExtra.originPlayerIndex ?? null },
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
   * Pushes an `__interaction_only__` leaf flow frame whose root ActionNode
   * already owns the pending envelope.
   */
  private pushPendingFrame(
    envelope: PendingEnvelope,
    ownerPlayerIndex: number,
    reason: SubFlowReason,
  ): void {
    const flow: ActionFlow = { type: 'leaf', actionId: INTERACTION_ONLY_ACTION_ID }
    const owner = this.state.players[ownerPlayerIndex]
    const root = new ActionNode(envelope.hostNodeId, INTERACTION_ONLY_ACTION_ID)
    root.ownerPlayerId = owner?.id
    root.setPending({
      ...envelope,
      hostNodeId: root.id,
      pendingActionId: INTERACTION_ONLY_ACTION_ID,
      ownerNodeId: envelope.ownerNodeId ?? null,
      effectiveOwnerPlayerId: envelope.effectiveOwnerPlayerId ?? owner?.id,
      syntheticKind: envelope.syntheticKind ?? 'interaction-only',
    })
    const engine = new Engine({
      tree: new EngineTree(root),
      registry: this.registry,
      hooks: this.hookDispatcher,
      log: this.engineLog,
    })
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
    roundPhase.startConfirmPlayerSwitch(this, fromPlayerIndex, toPlayerIndex)
  }
  private startFeedSubFlow(
    playerIndex: number,
    remaining: number,
    foodUsed: number,
    feedQueue?: FeedQueueEntry[],
  ): void {
    roundPhase.startFeedSubFlow(this, playerIndex, remaining, foodUsed, feedQueue)
  }

  private createEngine(
    actionId: string,
    ownerPlayerIndex = this.state.currentPlayerIndex,
  ): Engine {
    const action = this.registry.get(actionId)
    const counter = { value: 0 }
    const an = new ActionNode(`action-${actionId}`, actionId)
    const root = action?.flow
      ? this.buildEngineNode(action.flow, counter, this.state.players[ownerPlayerIndex]?.id)
      : action?.resolveChoice
        ? new SequenceNode(`seq-${actionId}`, [an])
        : an
    return new Engine({
      tree: new EngineTree(root),
      registry: this.registry,
      hooks: this.hookDispatcher,
      log: this.engineLog,
    })
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
    return p.resources.sheep + p.resources.boar + p.resources.cattle
  }

  private hasPendingAnimals(p: PlayerState) {
    return this.getAnimalCount(p) > getAssignedAnimalCount(p)
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
    return (
      getExchangesInWindow(player, 'harvest', this.state).length > 0 ||
      getExchangesInWindow(player, 'anytime', this.state).length > 0
    )
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
    return this.state.actionSpaces.find((item) => item.id === spaceId)
      ?? (spaceId.startsWith(SUBFLOW_SPACE_PREFIX) || spaceId.startsWith('__stage:')
        ? this.createSyntheticSpace(spaceId)
        : null)
  }

  private getPlayerEffectCardIds(player: PlayerState) {
    return [...player.improvements, ...player.minorPlayed, ...player.occupationPlayed]
  }

  /** Return hand card IDs whose registered effect declares `handHooks` containing `hook`. */
  private getPlayerHandEffectCardIds(player: PlayerState, hook: CardEffectHook) {
    const handCards = [...player.occupationHand, ...player.minorHand]
    return handCards.filter(id => {
      const effect = getCardEffect(id)
      return effect?.handHooks?.includes(hook)
    })
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
    return playerBoard(this.state, idx).farmyard.selectableTiles('room', {
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
    return playerBoard(this.state, idx).farmyard.selectableTiles('stable', {
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
    return playerBoard(this.state, idx).farmyard.selectableTiles('plow', {
      costOverride,
      exactCost: this.readExactCost(actionContext),
    })
  }

  private buildSowInteraction(player: PlayerState): InteractionFarmSelection {
    const actionContext = this.getActionContextFromTopFrame()
    const idx = this.state.players.indexOf(player)
    return playerBoard(this.state, idx).farmyard.selectableTiles('sow', { actionContext })
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
    return playerBoard(this.state, idx).farmyard.selectableTiles('fence', {
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
    return playerBoard(this.state, idx).farmyard.selectableTiles('farm-position', { actionContext })
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

  /**
   * Task 2 — read pending context through PendingEnvelope. The envelope
   * adapter owns pending host lookup.
   */
  private peekHostContextSnapshot(): PendingContextSnapshot | null {
    return pendingContextSnapshot(this.engineStack.peekPendingEnvelope())
  }

  /**
   * Task 2 — read the pending action id through PendingEnvelope. Returns
   * undefined when no pending envelope or the host did not record an action id.
   */
  private peekHostPendingActionId(): string | undefined {
    return this.engineStack.peekPendingEnvelope()?.pendingActionId
  }

  private buildAnytimeEntries(): { descriptor: AnytimeAction; flow: ActionFlow }[] {
    const policy = this.computeAnytimePolicySnapshot()
    if (!policy.allowed) return []
    const context = this.getActiveInteractionContext()
    if (!context) return []
    const blockedIds = new Set(policy.blockedIds)
    const { player, space } = context
    const anytimeEntries: { descriptor: AnytimeAction; flow: ActionFlow }[] = []
    for (const action of this.registry.values()) {
      if (!action.anytime) continue
      if (blockedIds.has(action.id)) continue
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
    }
    const matchedAnytime = getMatchingListeners(anytimeContext)
    for (const entry of matchedAnytime) {
      if (!entry.cardId) continue
      if (entry.ownerPlayerId !== player.id) continue
      if (blockedIds.has(entry.registration.id)) continue
      const result = executeCardListener(entry.registration, anytimeContext, {
        ownerPlayerId: entry.ownerPlayerId,
      })
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
      zoneType: zone.zoneType as 'pasture' | 'house' | 'stable',
      animalType: (zone.animalType as 'sheep' | 'boar' | 'cattle' | null) ?? null,
      animalCount: zone.animalCount ?? 0,
      capacity: zone.capacity,
    }))
  }

  /**
   * Derive the client-facing `InteractionState` from the current engine
   * stack. Pending prompts are read through `PendingEnvelope`; the envelope
   * adapter keeps host details hidden
   * hidden from production session reads.
   */
  private buildInteraction(): InteractionState {
    if (this.state.gameOver) {
      return {
        stateId: 'gameover',
        winners: this.computeWinnerIds(),
        scores: this.computeScoreSummary(),
        allowedCommands: [],
        anytimeActions: [],
      }
    }
    const frame = this.engineStack.current()
    const envelope = this.engineStack.peekPendingEnvelope()
    const pendingHost = this.engineStack.peekPendingHost()

    if (!frame || !envelope) {
      const anytimeActions = this.buildAnytimeEntries().map((entry) => entry.descriptor)
      return {
        stateId: 'idle',
        allowedCommands: anytimeActions.length > 0
          ? ['takeAction', 'undoStep', 'undoAction', 'takeAnytimeAction']
          : ['takeAction', 'undoStep', 'undoAction'],
        anytimeActions,
      }
    }

    const playerIndex = this.effectiveOwnerIndexForFrame(frame, envelope.hostNodeId, envelope)
    const spaceId = frame.spaceId
    const promptKey = envelope.promptKey
    const promptParams = envelope.promptParams
    const ctx = pendingContextSnapshot(envelope)
    const request: InteractionRequest = envelope.request
    const choiceOptions = pendingEnvelopeChoices(envelope)
    const sourceCard = envelope.sourceCard ?? ctx?.sourceCard ?? choicesSourceCard(choiceOptions)
    const costOverride = ctx?.costs
    const player = this.state.players[playerIndex]

    const policy = this.computeAnytimePolicySnapshot()
    const anytimeEntries = policy.allowed ? this.buildAnytimeEntries() : []
    const includeAnytimeCmd = policy.allowed && anytimeEntries.length > 0
    const buildCmds = (
      base: ReadonlyArray<InteractionCommand>,
    ): InteractionCommand[] => {
      if (!includeAnytimeCmd) return [...base]
      return [...base, 'takeAnytimeAction']
    }
    const anytimeDescriptors = anytimeEntries.map((entry) => entry.descriptor)

    switch (request.kind) {
      case 'animal-reorg':
        return {
          stateId: 'wait',
          playerIndex,
          spaceId,
          promptKey,
          promptParams,
          sourceCard,
          request,
          options: choiceOptions,
          zones: player ? this.buildAnimalReorgZones(player) : [],
          allowedCommands: buildCmds(['resolveChoice', 'undoStep', 'undoAction']),
          anytimeActions: anytimeDescriptors,
        }
      case 'confirm-next-player':
        return {
          stateId: 'wait',
          playerIndex,
          spaceId,
          promptKey,
          promptParams,
          sourceCard,
          request,
          nextPlayerIndex: request.nextPlayerIndex,
          allowedCommands: buildCmds(['resolveChoice', 'undoStep', 'undoAction']),
          anytimeActions: anytimeDescriptors,
        }
      case 'confirm-player-switch':
        return {
          stateId: 'wait',
          playerIndex,
          spaceId,
          promptKey,
          promptParams,
          sourceCard,
          request,
          fromPlayerIndex: request.fromPlayerIndex,
          toPlayerIndex: request.toPlayerIndex,
          allowedCommands: buildCmds(['resolveChoice', 'undoStep', 'undoAction']),
          anytimeActions: anytimeDescriptors,
        }
      case 'feed':
        return {
          stateId: 'wait',
          playerIndex,
          spaceId,
          promptKey,
          promptParams,
          sourceCard,
          request,
          remaining: request.remaining,
          foodUsed: request.foodUsed,
          feedQueue: request.feedQueue,
          allowedCommands: buildCmds(['resolveChoice', 'undoStep', 'undoAction']),
          anytimeActions: anytimeDescriptors,
        }
      case 'farm-select':
        return {
          stateId: 'wait',
          playerIndex,
          spaceId,
          promptKey,
          promptParams,
          sourceCard,
          request,
          options: choiceOptions,
          costOverride,
          farm: request.farm,
          allowedCommands: buildCmds(['commitSelection', 'undoStep', 'undoAction']),
          anytimeActions: anytimeDescriptors,
        }
      case 'resource-quantity-select':
        return {
          stateId: 'wait',
          playerIndex,
          spaceId,
          promptKey,
          promptParams,
          sourceCard,
          request,
          options: choiceOptions,
          costOverride,
          allowedCommands: buildCmds(['commitSelection', 'undoStep', 'undoAction']),
          anytimeActions: anytimeDescriptors,
        }
      case 'resource-batch-exchange-select':
        return {
          stateId: 'wait',
          playerIndex,
          spaceId,
          promptKey,
          promptParams,
          sourceCard,
          request,
          options: choiceOptions,
          costOverride,
          allowedCommands: buildCmds(['commitSelection', 'undoStep', 'undoAction']),
          anytimeActions: anytimeDescriptors,
        }
      case 'select-trigger':
        return {
          stateId: 'wait',
          playerIndex,
          spaceId,
          promptKey,
          promptParams,
          sourceCard,
          request,
          options: choiceOptions,
          allowedCommands: buildCmds(['resolveChoice', 'undoStep', 'undoAction']),
          anytimeActions: anytimeDescriptors,
        }
      case 'card-draft':
        return {
          stateId: 'wait',
          playerIndex,
          spaceId,
          promptKey,
          promptParams,
          sourceCard,
          request,
          options: choiceOptions,
          allowedCommands: buildCmds(['undoStep', 'undoAction']),
          anytimeActions: anytimeDescriptors,
        }
      case 'engine-blocked':
        return {
          stateId: 'wait',
          playerIndex,
          spaceId,
          promptKey: request.reasonKey ?? promptKey ?? 'ui.interactionEngineBlocked',
          promptParams,
          sourceCard,
          request,
          options: [],
          allowedCommands: ['undoStep', 'undoAction'],
          anytimeActions: [],
        }
      case 'choice':
      default: {
        const selectionKind = this.isSelectionPromptKey(promptKey)
        if (pendingHost && selectionKind && player) {
          return {
            stateId: 'wait',
            playerIndex,
            spaceId,
            promptKey,
            promptParams,
            sourceCard,
            request,
            options: choiceOptions,
            costOverride,
            selection: this.buildSelectionInteractionFromNode(player),
            allowedCommands: buildCmds(['commitSelection', 'undoStep', 'undoAction']),
            anytimeActions: anytimeDescriptors,
          }
        }
        const farm = pendingHost && player ? this.buildFarmInteractionFromNode(promptKey, player) : null
        const allowedCommands: InteractionCommand[] = farm
          ? buildCmds(['commitSelection', 'undoStep', 'undoAction'])
          : buildCmds(['resolveChoice', 'undoStep', 'undoAction'])
        if (farm) {
          return {
            stateId: 'wait',
            playerIndex,
            spaceId,
            promptKey,
            promptParams,
            sourceCard,
            request,
            options: choiceOptions,
            costOverride,
            farm,
            allowedCommands,
            anytimeActions: anytimeDescriptors,
          }
        }
        return {
          stateId: 'wait',
          playerIndex,
          spaceId,
          promptKey,
          promptParams,
          sourceCard,
          request,
          options: choiceOptions,
          costOverride,
          allowedCommands,
          anytimeActions: anytimeDescriptors,
        }
      }
    }
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
    const interaction: InteractionState = isDrafting
      ? { stateId: 'idle', allowedCommands: [], anytimeActions: [] }
      : this.buildInteraction()
    const resp: SessionResponse = {
      ok,
      state: this.state,
      interaction,
      historyLength: this.history.length,
      hasActionStartSnapshot: this.actionStartIndex !== null,
      scores: Scoring.computeAll(this.state),
      pastureCapacities: this.getPastureCapacities(),
    }
    // Include backend-computed availability for the current player when
    // they're free to act (idle interaction, not gameover, not drafting).
    if (!this.state.gameOver && interaction.stateId === 'idle' && !isDrafting) {
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
    }
  }

  /**
   * Whether the current engine-stack state is an engine choice — i.e. the
   * top-of-stack pending envelope has a `choice` / `animal-reorg` /
   * `farm-select` / `selection` request, OR a composite pending
   * choice from OrNode / XorNode or an optional metadata host. Used by `pushHistory()`
   * to populate `HistoryEntry.hadChoicePending`, which `undoStep()`
   * consults via the `canRestorePriorChoice` branch.
   */
  private currentIsChoicePending(): boolean {
    const frame = this.engineStack.current()
    if (!frame) return false
    const kind = this.engineStack.peekPendingEnvelope()?.request.kind
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
        deferredPlayerSwitch: null,
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

  private recomputeActionStartIndex() {
    for (let i = this.history.length - 1; i >= 0; i -= 1) {
      if (this.history[i]?.actionStart) {
        this.actionStartIndex = i
        return
      }
    }
    this.actionStartIndex = null
  }

  private buildRoundSnapshot(state: GameState): GameState {
    const snapshot = cloneState(state)
    // workers return home at round start — just clear action space occupancy.
    snapshot.actionSpaces.forEach((space) => { space.takenBy = [] })
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
   * Mid-flow flush: when a leaf ActionNode inside a SEQ/optional flow finishes,
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

  private startStageFlow(
    flow: ActionFlow,
    hook: StageResumeState['hook'],
    playerIndex: number,
    nextCardIndex: number,
  ) {
    this.engineStack.push({
      engine: this.createFlowEngine(flow, playerIndex),
      source: { kind: 'flow', flow },
      spaceId: `__stage:${hook}`,
      ownerPlayerIndex: playerIndex,
      stageResume: { hook, playerIndex, cardIndex: nextCardIndex },
      deferredPlayerSwitch: null,
      reason: 'stage-hook',
    })
    this.runEngineSteps()
  }

  private continueStageHook(
    hook: StageResumeState['hook'],
    playerIndex = 0,
    cardIndex = 0,
  ) {
    for (let currentPlayerIndex = playerIndex; currentPlayerIndex < this.state.players.length; currentPlayerIndex += 1) {
      const player = this.state.players[currentPlayerIndex]
      if (!player) continue
      const cards = [
        ...this.getPlayerEffectCardIds(player),
        ...this.getPlayerHandEffectCardIds(player, hook as CardEffectHook),
      ]
      const startCardIndex = currentPlayerIndex === playerIndex ? cardIndex : 0
      for (let currentCardIndex = startCardIndex; currentCardIndex < cards.length; currentCardIndex += 1) {
        const cardId = cards[currentCardIndex]
        if (!cardId) continue
        const flow = runCardEffectHook(this.state, player, cardId, hook as CardEffectHook)
        if (!flow) continue
        this.startStageFlow(flow, hook, currentPlayerIndex, currentCardIndex + 1)
        return true
      }
    }
    return false
  }

  private continueSinglePlayerStageHook(
    hook: StageResumeState['hook'],
    playerIndex: number,
    cardIndex = 0,
  ) {
    const player = this.state.players[playerIndex]
    if (!player) return false
    const cards = this.getPlayerEffectCardIds(player)
    for (let currentCardIndex = cardIndex; currentCardIndex < cards.length; currentCardIndex += 1) {
      const cardId = cards[currentCardIndex]
      if (!cardId) continue
      const flow = runCardEffectHook(this.state, player, cardId, hook as CardEffectHook)
      if (!flow) continue
      this.startStageFlow(flow, hook, playerIndex, currentCardIndex + 1)
      return true
    }
    return false
  }

  /** S2 Task 10 part 6: thin delegator — body lives in `phases/round.ts`. */
  private finishCompletedActionTurn(playerIndex: number): SessionResponse {
    return roundPhase.finishCompletedActionTurn(this, playerIndex)
  }

  private continueEndTurnHooks(playerIndex: number, cardIndex = 0): SessionResponse {
    if (this.continueSinglePlayerStageHook('onEndTurn', playerIndex, cardIndex)) {
      return this.respond()
    }
    return this.finishCompletedActionTurn(playerIndex)
  }

  private continueHarvestFromBeforeHarvest(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.continueStageHook('onBeforeHarvest', playerIndex, cardIndex)) {
      return this.respond()
    }
    return this.continueFromStartHarvest()
  }

  private continueFromStartHarvest(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.continueStageHook('onStartHarvest', playerIndex, cardIndex)) {
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
          harvestedPositions: [],
        }
      })
    }
    if (this.continueStageHook('onStartHarvestFieldPhase', playerIndex, cardIndex)) {
      return this.respond()
    }
    return this.continueHarvestFieldPhase()
  }

  private continueHarvestFieldPhase(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.continueStageHook('onHarvestFieldPhase', playerIndex, cardIndex)) {
      return this.respond()
    }
    return this.continueHarvestReap()
  }

  private continueHarvestReap(): SessionResponse {
    const harvestOrder = this.getHarvestPlayerIndices()
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
      incHarvestedGrain(player, result.reapSummary.resources.grain ?? 0)
      incHarvestedVegetable(player, result.reapSummary.resources.vegetable ?? 0)
      if (!this.hasPositiveResources(entry.resources)) {
        appendImmediateEvents(this.state, [{ type: 'harvest.reapNothing', playerId: player.id }], {
          actorPlayerId: player.id,
        })
      }
    })
    return this.continueAfterReapEffects()
  }

  private continueAfterReapEffects(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.continueStageHook('onAfterReap', playerIndex, cardIndex)) {
      return this.respond()
    }
    return this.continueEndFieldPhase()
  }

  private continueEndFieldPhase(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.continueStageHook('onEndHarvestFieldPhase', playerIndex, cardIndex)) {
      return this.respond()
    }
    delete this.state.harvestReapSummary
    this.state.roundPhase = 'harvest'
    return this.continueHarvestEffects()
  }

  private continueHarvestEffects(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.continueStageHook('onHarvest', playerIndex, cardIndex)) {
      return this.respond()
    }

    this.state.roundPhase = 'feeding'
    appendImmediateEvents(this.state, [{
      type: 'harvest.phaseStarted',
      harvestPhase: 'feeding',
    }])
    if (this.continueStageHook('onStartHarvestFeedingPhase')) {
      return this.respond()
    }
    return this.continueHarvestFeeding()
  }

  private continueHarvestFeeding(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (playerIndex === 0 && cardIndex === 0) {
      const harvestOrder = this.getHarvestPlayerIndices()
      harvestOrder.forEach((index) => {
        const player = this.state.players[index]
        if (player) runBeforeFeedHooks(this.state, player)
      })
    }
    if (this.continueStageHook('onHarvestFeedingPhase', playerIndex, cardIndex)) {
      return this.respond()
    }
    return this.executeFeedingLogic()
  }

  private executeFeedingLogic(): SessionResponse {
    const harvestOrder = this.getHarvestPlayerIndices()
    const feedQueue: { index: number; remaining: number; foodUsed: number }[] = []

    for (const i of harvestOrder) {
      const player = this.state.players[i]!
      const size = familySize(player)
      const newborn = Math.min(newbornCount(player), size)
      const required = Math.max(0, size * 2 - newborn)
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
          continue
        }
        feedQueue.push({ index: i, remaining: 0, foodUsed: useFood })
        continue
      }

      const canConvert =
        player.resources.grain > 0 ||
        player.resources.vegetable > 0 ||
        hasHarvestExchange

      if (canConvert) {
        feedQueue.push({ index: i, remaining, foodUsed: useFood })
      } else {
        player.resources.begging += remaining
        this.logHarvestResourceEntry('log.harvestFeedDetail', player, {
          food: useFood,
          begging: remaining,
        })
      }
    }

    if (feedQueue.length > 0) {
      const first = feedQueue[0]!
      this.startFeedSubFlow(
        first.index,
        first.remaining,
        first.foodUsed,
        feedQueue.slice(1),
      )
      return this.respond()
    }

    return this.startBreedPhase()
  }

  private continueEndHarvestEffects(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.continueStageHook('onEndHarvest', playerIndex, cardIndex)) {
      return this.respond()
    }
    return this.continueAfterHarvestEffects()
  }

  private continueAfterHarvestEffects(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.continueStageHook('onAfterHarvest', playerIndex, cardIndex)) {
      return this.respond()
    }
    delete this.state.harvestBreedSummary
    return this.finalizeRound()
  }

  private continueBeforeStartOfTurn(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.continueStageHook('onBeforeStartOfTurn', playerIndex, cardIndex)) {
      return this.respond()
    }
    this.state.players.forEach((player) => resetRoundPlacements(player))
    const roundOpen = createRoundOpenById(this.state.roundActionOrder)
    const futureResolvedEvents = this.state.futureMeeples
      .filter((entry) =>
        entry.round === this.state.round &&
        this.state.players.some((player) => player.id === entry.playerId),
      )
      .map((entry) => ({
        type: 'futureMeeple.resolved',
        playerId: entry.playerId,
        cardId: entry.cardId,
        sourceCardId: entry.cardId,
        round: entry.round,
        ...(Object.keys(entry.resources ?? {}).length > 0 ? { resources: entry.resources } : {}),
        ...(entry.roomType ? { roomType: entry.roomType } : {}),
      }) as ImmediateEventDraft)
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
        const resources: Partial<Resource> = {}
        resourceKeyList.forEach((key) => {
          const amount = space.gainPerRound[key] ?? 0
          if (amount > 0) resources[key] = amount
        })
        if (Object.keys(resources).length > 0) {
          events.push({
            type: 'action.accumulated',
            spaceId: space.id,
            resources,
          })
        }
      }
      return events
    })
    applyRoundGrowth(this.state)
    applyFutureMeeples(this.state)
    appendImmediateEvents(this.state, [
      { type: 'round.started' },
      ...futureResolvedEvents,
      ...actionEvents,
    ])
    if (this.continueStageHook('onRoundStart')) {
      return this.respond()
    }
    const startIdx = this.state.players.findIndex((player) => player.startPlayer)
    this.state.currentPlayerIndex = startIdx === -1 ? 0 : startIdx
    if (this.state.round >= 2 && startIdx >= 0) {
      incFirstPlayer(this.state.players[startIdx]!)
    }
    this.state.roundPhase = 'work'
    appendImmediateEvents(this.state, [{ type: 'work.started' }])
    this.state.roundStartSnapshot = this.buildRoundSnapshot(this.state)
    this.engineStack.clear()
    this.history = []
    this.actionStartIndex = null
    return this.respond()
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
  ): void {
    return roundPhase.continueAfterReorganizeRoundEnd(this, playerIndex, originPlayerIndex)
  }

  private resumeStageFlow(stageResume: StageResumeState) {
    switch (stageResume.hook) {
      case 'onBeforeHarvest':
        this.continueHarvestFromBeforeHarvest(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onAfterReap':
        this.continueAfterReapEffects(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onHarvest':
        this.continueHarvestEffects(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onEndHarvest':
        this.continueEndHarvestEffects(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onAfterHarvest':
        this.continueAfterHarvestEffects(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onBeforeStartOfTurn':
        this.continueBeforeStartOfTurn(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onRoundStart':
        this.continueBeforeStartOfTurn(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onStartHarvestFeedingPhase':
        this.continueHarvestEffects(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onEndTurn':
        this.continueEndTurnHooks(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onBeforeReturnHome':
        this.continueBeforeReturnHomeHooks(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onReturnHome':
        this.continueReturnHomeHooks(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onStartReturnHome':
        this.continueStartReturnHomeHooks(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onAfterRoundEnd':
        this.continueAfterRoundEnd(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onStartHarvest':
        this.continueFromStartHarvest(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onStartHarvestFieldPhase':
        this.continueHarvestFieldStart(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onHarvestFieldPhase':
        this.continueHarvestFieldPhase(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onEndHarvestFieldPhase':
        this.continueEndFieldPhase(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onHarvestFeedingPhase':
        this.continueHarvestFeeding(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onEndHarvestFeedingPhase':
        this.continueAfterFeedingPhase(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onAllWorkersPlaced':
        this.continueAllWorkersPlacedHooks(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onBreedPhase':
        this.continueEndHarvestEffects()
        return
      case 'onReorganizeComplete':
        return this.continueAfterSubFlow(stageResume)
    }
  }

  /**
   * Umbrella resume entry-point for sub-flow frames that complete via stage
   * resume. Today only `onReorganizeComplete` flows through here — it
   * dispatches to one of the trigger-specific continueAfterReorganize_*
   * helpers based on `extra.trigger`. Future sub-flows (feed, confirm) will
   * register their own switch arms here as Task 9 introduces them.
   *
   * For non-reorganize hooks, callers continue to use `resumeStageFlow`
   * directly (those branches are not stack-aware sub-flows yet).
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
      )
    }
    // Fall-through: delegate to the stage flow resolver for hooks
    // that have not (yet) been migrated to the sub-flow umbrella model.
    this.resumeStageFlow(stageResume)
  }

  private effectiveOwnerIndexForFrame(
    frame: EngineFrame,
    nodeId?: string | null,
    envelope?: PendingEnvelope | null,
  ): number {
    const frameOwnerId = this.state.players[frame.ownerPlayerIndex]?.id
    const ownerId =
      envelope?.effectiveOwnerPlayerId ??
      (nodeId ? frame.engine.getEffectiveOwnerPlayerId(nodeId, frameOwnerId) : frameOwnerId)
    if (!ownerId) return frame.ownerPlayerIndex
    const ownerIndex = this.state.players.findIndex((player) => player.id === ownerId)
    return ownerIndex === -1 ? frame.ownerPlayerIndex : ownerIndex
  }

  private currentFrameOwnerPlayerId(defaultPlayerId?: string): string | undefined {
    const frame = this.engineStack.current()
    if (!frame) return defaultPlayerId
    return this.state.players[frame.ownerPlayerIndex]?.id ?? defaultPlayerId
  }

  private acknowledgeCurrentActionAnimalReorgRequest(): void {
    const pendingHost = this.engineStack.peekPendingHost()
    if (!(pendingHost instanceof ActionNode)) return
    pendingHost.clearPending()
    pendingHost.emittedRequest = undefined
    pendingHost.resolve({ type: 'ok' })
  }

  private runEngineSteps(): void {
    let frame = this.engineStack.current()
    if (!frame || frame.ownerPlayerIndex === null || !frame.spaceId) return
    const space = this.getSpaceById(frame.spaceId)
    if (!this.state.players[frame.ownerPlayerIndex] || !space) return

    while (true) {
      const nextNodeId = frame.engine.peekNextUnresolvedNodeId()
      const effectivePlayerIndex = this.effectiveOwnerIndexForFrame(frame, nextNodeId)
      const frameOwnerPlayer = this.state.players[frame.ownerPlayerIndex]
      const player = this.state.players[effectivePlayerIndex]
      if (!frameOwnerPlayer || !player) return
      if (effectivePlayerIndex !== frame.ownerPlayerIndex) {
        const existing = frame.deferredPlayerSwitch
        if (
          !existing ||
          existing.fromPlayerIndex !== frame.ownerPlayerIndex ||
          existing.toPlayerIndex !== effectivePlayerIndex
        ) {
          frame.deferredPlayerSwitch = {
            fromPlayerIndex: frame.ownerPlayerIndex,
            toPlayerIndex: effectivePlayerIndex,
          }
        }
      } else {
        frame.deferredPlayerSwitch = null
      }
      const before = this.clonePlayer(player)
      const step = frame.engine.proceed(this.buildEngineExecutionContext(player, space))
      this.flushEngineLog()

      if (step.type === 'blocked' && step.mandatory === true && step.actionId) {
        frame.deferredPlayerSwitch = null
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
        frame.deferredPlayerSwitch = null
        const isActionEngine = frame.source.kind === 'action'
        const stageResume = (frame.stageResume ?? null) as StageResumeState | null
        const ownerIdx = frame.ownerPlayerIndex
        if (stageResume) {
          this.engineStack.pop()
          this.resumeStageFlow(stageResume)
          return
        }
        if (isActionEngine && this.runPlaceFarmerAfterHooks(frameOwnerPlayer, space)) {
          // The frame's engine/source were replaced in-place; loop again with
          // the same frame.
          frame = this.engineStack.current()!
          continue
        }
        if (this.hasPendingAnimals(frameOwnerPlayer)) {
          const originIdx = this.turnOwnerPlayerIndex ?? ownerIdx
          this.engineStack.pop()
          this.startReorganizeSubFlow(ownerIdx, 'anytime', { originPlayerIndex: originIdx })
          return
        }
        if (this.turnOwnerPlayerIndex !== null) {
          const ownerIndexLocal = this.turnOwnerPlayerIndex
          this.finalizeActionLog(frameOwnerPlayer)
          this.engineStack.pop()
          this.continueEndTurnHooks(ownerIndexLocal)
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
        // Task 2: read the request discriminator through PendingEnvelope.
        // The engine owns the pending envelope regardless of host node type.
        const pendingEnvelope = this.engineStack.peekPendingEnvelope()
        const hostRequestKind = pendingEnvelope?.request.kind ?? null
        const isReorgSubFlow =
          frame.source.kind === 'flow'
          && (frame.source.flow as { actionId?: string }).actionId === 'reorganize'
        if (hostRequestKind === 'animal-reorg' && !isReorgSubFlow) {
          const pIdx = this.effectiveOwnerIndexForFrame(
            frame,
            pendingEnvelope?.hostNodeId,
            pendingEnvelope,
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
        if (frame.deferredPlayerSwitch && !frame.deferredPlayerSwitch.confirmed) {
          const { fromPlayerIndex, toPlayerIndex } = frame.deferredPlayerSwitch
          frame.deferredPlayerSwitch = null
          frame.engine.flushEventTransaction({ state: this.state, player, space })
          this.flushEngineLog()
          this.startConfirmPlayerSwitch(fromPlayerIndex, toPlayerIndex)
          return
        }
        if (
          hostRequestKind === 'farm-select' ||
          hostRequestKind === 'selection' ||
          !!this.isSelectionPromptKey(pendingEnvelope?.promptKey)
        ) {
          frame.engine.flushEventTransaction({ state: this.state, player, space })
          this.flushEngineLog()
          return
        }
        const pendingHost = this.engineStack.peekPendingHost()
        const pendingActionId = pendingEnvelope?.pendingActionId
        const pendingActionCanResolve = pendingActionId
          ? this.registry.get(pendingActionId)?.resolveChoice !== undefined
          : false
        if (
          pendingHost?.getPending() !== null &&
          !(pendingHost instanceof OrNode) &&
          !(pendingHost instanceof XorNode) &&
          !pendingActionCanResolve
        ) {
          return
        }
        if (step.choice.options.length === 1) {
          let autoOptions = step.choice.options
          while (autoOptions.length === 1) {
            const auto = autoOptions[0]
            if (auto?.disabled === true) return
            const resolvedActionId = this.peekHostPendingActionId()
            const result = frame.engine.resolveChoice(
              auto.value,
              this.buildEngineExecutionContext(player, space),
            )
            this.flushEngineLog()
            if (result.type === 'ok' && resolvedActionId && !isInjectedAnytimeResult(result)) {
              this.recordActionResultDetails(result, frameOwnerPlayer.id, player.id)
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
              this.engineStack.pop()
              this.actionStartIndex = null
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
          removeWorkerRef(space, player.id)
        }
        this.engineStack.pop()
        this.actionStartIndex = null
        this.actionStartPlayerSnapshot = null
        delete player._activeActionBonusSources
        this.turnOwnerPlayerIndex = null
        return
      }

      if (
        step.type === 'ok' &&
        step.result.type === 'ok' &&
        !isInjectedAnytimeResult(step.result)
      ) {
        this.recordActionResultDetails(step.result, frameOwnerPlayer.id, player.id)
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
        // top. When it completes, resumeStageFlow's onReorganizeComplete
        // branch detects the parent frame and calls runEngineSteps again.
        this.startReorganizeSubFlow(pIdx, 'anytime')
        return
      }
    }
  }

  getState(): SessionResponse {
    return this.respond()
  }

  /**
   * Returns true when at least one card listener for the `isDoable` phase
   * explicitly vetoes the action (e.g. C51 FishingNet blocking opponent
   * fishing on 0 food). Unlike the full `applyIsDoable` path, this skips
   * `space.canBeExecutedByPlayer` and `applyIsDoableHooks` — those are
   * conservative for OR-flow actions and would over-block normal cases like
   * "OR(sow, bake-bread)" where every child is currently undoable but the
   * engine still wants to enter and present a skip-only choice.
   */
  private listenersVetoIsDoable(player: PlayerState, space: ActionSpace): boolean {
    const ctx: import('../cards/card-listeners.ts').CardListenerContextInput = {
      state: this.state,
      player,
      space,
      actionId: space.id,
      phase: 'isDoable',
      doable: true,
    }
    const matched = getMatchingListeners(ctx)
    for (const entry of matched) {
      const result = executeCardListener(entry.registration, ctx, {
        ownerPlayerId: entry.ownerPlayerId,
      })
      if (result && result.doable === false) return true
    }
    return false
  }

  private isActionSpaceAvailableToPlayer(player: PlayerState, space: ActionSpace): boolean {
    if (!canEnterSpace(space, player, this.state)) return false
    if (workersAvailable(this.state, player) <= 0) return false
    if (isSpaceOccupied(space)) {
      const allowed = computeAllowedPlacementSpaces(this.state, player)
      if (!allowed.some(a => a.spaceId === space.id)) return false
    }
    return this.hookDispatcher.applyIsDoable(
      { state: this.state, player, space, actionId: space.id },
      space,
      space.canBeExecutedByPlayer(this.state, player),
    )
  }

  getAvailableActions(playerIndex: number): { spaceId: string; nameKey: string }[] {
    const player = this.state.players[playerIndex]
    if (!player) return []
    return this.state.actionSpaces
      .filter((space) => this.isActionSpaceAvailableToPlayer(player, space))
      .map((space) => ({ spaceId: space.id, nameKey: space.nameKey }))
  }

  /**
   * Compute which action spaces can be executed by the current player.
   * Returns a map of spaceId -> isExecutable for all action spaces.
   */
  getActionAvailability(playerIndex: number): Record<string, boolean> {
    const player = this.state.players[playerIndex]
    if (!player) return {}

    const result: Record<string, boolean> = {}

    for (const space of this.state.actionSpaces) {
      result[space.id] = this.isActionSpaceAvailableToPlayer(player, space)
    }

    // Also mark occupied spaces that computeArgs listeners expose as extra options
    if (workersAvailable(this.state, player) > 0) {
      const listenerContext: import('../cards/card-listeners.ts').CardListenerContextInput = {
        state: this.state,
        player,
        space: this.state.actionSpaces[0],
        actionId: 'place-farmer',
        phase: 'computeArgs',
      }
      const matched = getMatchingListeners(listenerContext)
      for (const entry of matched) {
        const r = executeCardListener(entry.registration, listenerContext, {
          ownerPlayerId: entry.ownerPlayerId,
        })
        if (!r?.extraOptions) continue
        for (const opt of r.extraOptions) {
          if (opt.value.startsWith(OCCUPIED_SPACE_CHOICE_PREFIX)) {
            const spaceId = opt.value.slice(OCCUPIED_SPACE_CHOICE_PREFIX.length)
            if (!result[spaceId]) {
              result[spaceId] = true
            }
          }
        }
      }
    }

    return result
  }

  getCardAvailability(
    playerIndex: number,
    actionAvailability = this.getActionAvailability(playerIndex),
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

    this.state.availableMajorImprovements.forEach((improvementId) => {
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
    return roundPhase.takeAction(this, playerIndex, spaceId)
  }

  /** S2 Task 10 part 4: thin delegator — body lives in `phases/round.ts`. */
  takeAnytimeAction(playerIndex: number, actionId: string): SessionResponse {
    return roundPhase.takeAnytimeAction(this, playerIndex, actionId)
  }

  private resolveEngineChoice(
    playerIndex: number,
    value: string,
    pushHistoryEntry: boolean,
    payload?: Record<string, unknown>,
  ): SessionResponse {
    const envelope = this.engineStack.peekPendingEnvelope()
    const frame = this.engineStack.current()
    const pendingPlayerIndex = frame
      ? this.effectiveOwnerIndexForFrame(frame, envelope?.hostNodeId, envelope)
      : -1
    const pendingOptions = pendingEnvelopeChoices(envelope)
    const pendingSnapshot = pendingContextSnapshot(envelope)
    const pendingActionContext = pendingSnapshot?.actionContext
    const pendingSourceCard =
      envelope?.sourceCard ?? pendingSnapshot?.sourceCard ?? choicesSourceCard(pendingOptions)
    // 'choice' (typed), 'animal-reorg' (pending-envelope commit pathway), and any
    // ChoiceNode-emitted untyped request all flow through the engine's
    // resolveChoice path. Composite-node and optional-host emissions are
    // also accepted: those don't carry a special node but the engine
    // has a pending choice on the host node itself.
    // 'feed' / 'confirm-next-player' / 'confirm-player-switch' are
    // dispatched by the public `resolveChoice` to dedicated handlers and
    // never reach this method.
    const requestKind = envelope?.request.kind
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
    if (pendingSourceCard && !protectedDirectCancel) {
      const cardEffect = getCardEffect(pendingSourceCard)
      if (cardEffect?.resolveChoice) {
        const cardFlow = cardEffect.resolveChoice(this.state, player, value, {
          sourceCard: pendingSourceCard,
          actionContext: pendingActionContext,
          emitPrivateEvent: (event) => this.emitResponsePrivateEvent(event),
        })
        if (cardFlow && this.engine) {
          // Insert the follow-up so it runs after the engine finishes resolving the choice.
          // Mirrors the `{ type: 'flow' }` branch of the engine's own resolveChoice.
          this.engineStack.insertFlowAfterPendingChoice(cardFlow, player.id)
        }
      }
    }
    const result = this.engine.resolveChoice(
      value,
      this.buildEngineExecutionContext(player, space),
      payload,
    )
    this.flushEngineLog()
    if (result.type === 'ok' && resolvedActionId && !isInjectedAnytimeResult(result)) {
      this.recordActionResultDetails(
        result,
        this.currentFrameOwnerPlayerId(player.id),
        player.id,
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
    const envelope = this.engineStack.peekPendingEnvelope()
    const request = envelope?.request
    if (request) {
      const protectedDirectCancel = isProtectedActionCancel(envelope.pendingActionId, value)
      if (!protectedDirectCancel && !isPendingChoiceValueAllowed(envelope, value)) {
        const disabled = pendingEnvelopeChoices(envelope)
          .some((option) => option.value === value && option.disabled === true)
        if (disabled && String(envelope.promptKey) === 'cards.B3_Moonshine.choice') return this.respond(false, 'choice disabled')
        return this.respond(false, 'invalid choice value')
      }
      if (
        request.kind === 'choice' &&
        (this.isFarmPromptKey(envelope.promptKey) || this.isSelectionPromptKey(envelope.promptKey))
      ) {
        return this.respond(false, 'use commitSelectionChoice for selection')
      }
      switch (request.kind) {
        case 'confirm-next-player':
          return this.handleConfirmNextPlayerResolved(request.nextPlayerIndex)
        case 'confirm-player-switch':
          return this.handleConfirmPlayerSwitchResolved(request.fromPlayerIndex, request.toPlayerIndex)
        case 'feed': {
          const sels = (payload as { selections?: FeedSelections } | undefined)?.selections
            ?? (Array.isArray(payload) ? (payload as unknown as FeedSelections) : [])
          return this.handleFeedResolved(playerIndex, sels)
        }
        case 'animal-reorg':
        case 'choice':
          return this.resolveEngineChoice(playerIndex, value, true, payload)
        case 'farm-select':
        case 'selection':
          return this.respond(false, 'use commitSelectionChoice for selection')
        case 'select-trigger':
          return this.resolveEngineChoice(playerIndex, value, true, payload)
        case 'resource-quantity-select':
          // B157_Salter-style mixed resource panel. The dedicated commit pathway
          // is commitSelectionChoice (see Task C1); resolveChoice is rejected
          // explicitly so future callers cannot silently route through the
          // typed commit path.
          return this.respond(false, 'use commitSelectionChoice for resource-quantity-select')
        case 'resource-batch-exchange-select':
          return this.respond(false, 'use commitSelectionChoice for resource-batch-exchange-select')
        case 'card-draft':
          return this.respond(false, 'card-draft resolveChoice not supported')
        case 'engine-blocked':
          return this.respond(false, 'engine-blocked cannot resolve')
        default: {
          const _exhaustive: never = request
          return this.respond(false, `unhandled interaction kind: ${JSON.stringify(_exhaustive)}`)
        }
      }
    }
    return this.resolveEngineChoice(playerIndex, value, true, payload)
  }

  startDevFenceSelect(playerIndex: number): SessionResponse {
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
        sourceCard: undefined,
        actionContext: undefined,
      },
      effectiveOwnerPlayerId: player.id,
      syntheticKind: 'interaction-only',
    }, playerIndex, 'top-level')
    return this.respond()
  }

  private handleFeedResolved(
    playerIndex: number,
    selections: FeedSelections,
  ): SessionResponse {
    // Read the synthetic feed request payload through PendingEnvelope.
    const envelope = this.engineStack.peekPendingEnvelope()
    const request = envelope?.request
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
        const remaining = Math.max(0, exchange.max - usedSoFar)
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
          ;(player.resources as Record<string, number>)[k] -= total
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
        appendImmediateEvents(this.state, [{
          type: 'harvest.feedConverted',
          playerId: player.id,
          source: sel.sourceName ?? 'Harvest conversion',
          cost: costMap,
          food: gainMap,
        }], { actorPlayerId: player.id })
        // Dispatch CardExchange.sideEffect (e.g. E153 StoneSculptor bonusVp).
        if (exchange.sideEffect && times > 0) {
          applyTradeSideEffect(
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
    if (feedQueue.length > 0) {
      const next = feedQueue[0]!
      this.startFeedSubFlow(
        next.index,
        next.remaining,
        next.foodUsed,
        feedQueue.slice(1),
      )
      return this.respond()
    }

    return this.startBreedPhase()
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
    if (this.continueStageHook('onAllWorkersPlaced', playerIndex, cardIndex)) {
      return this.respond()
    }
    return this.performRoundEnd()
  }

  /** S2 Task 10 part 7: thin delegator — body lives in `phases/round.ts`. */
  performRoundEnd(): SessionResponse { return roundPhase.performRoundEnd(this) }

  private continueBeforeReturnHomeHooks(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.continueStageHook('onBeforeReturnHome', playerIndex, cardIndex)) {
      return this.respond()
    }
    return this.continueStartReturnHomeHooks()
  }

  private continueStartReturnHomeHooks(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.continueStageHook('onStartReturnHome', playerIndex, cardIndex)) {
      return this.respond()
    }
    return this.continueReturnHomeHooks()
  }

  private continueReturnHomeHooks(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.continueStageHook('onReturnHome', playerIndex, cardIndex)) {
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
    // workersAvailable is derived from workers[]; clearing takenBy returns workers home.
    this.state.actionSpaces.forEach((s) => { s.takenBy = [] })
    // Release any workers that cards were holding (e.g. C22_BasketChair).
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
    if (this.continueStageHook('onEndHarvestFeedingPhase', playerIndex, cardIndex)) {
      return this.respond()
    }
    const harvestOrder = this.getHarvestPlayerIndices()
    harvestOrder.forEach((index) => {
      const player = this.state.players[index]
      if (player) runAfterFeedHooks(this.state, player)
    })
    this.state.harvestBreedSummary = {}

    // E58 LunchtimeBeer-style cards opt out of breeding for the current round.
    const breedOrder = harvestOrder.filter((index) => {
      const p = this.state.players[index]
      return p ? !this.hasPassFieldAndBreed(p) : false
    })
    const flow = this.buildHarvestBreedFlow(breedOrder)
    if (flow) {
      this.startStageFlow(flow, 'onBreedPhase', 0, 0)
      return this.respond()
    }
    return this.continueEndHarvestEffects()
  }

  private buildHarvestBreedFlow(harvestOrder: number[]): ActionFlow | null {
    const players = harvestOrder
      .map((idx) => this.state.players[idx])
      .filter((p): p is PlayerState => !!p)
    if (players.length === 0) return null
    const children: ActionFlow[] = []
    for (const p of players) {
      children.push({ ...breedLeaf('harvest'), targetPlayerId: p.id })
    }
    if (children.length === 1) {
      return children[0]
    }
    return { type: 'seq', children }
  }

  /** S2 Task 10 part 7: thin delegator — body lives in `phases/round.ts`. */
  private finalizeRound(): SessionResponse { return roundPhase.finalizeRound(this) }

  private continueAfterRoundEnd(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.continueStageHook('onAfterRoundEnd', playerIndex, cardIndex)) {
      return this.respond()
    }
    this.state.players.forEach((p) => {
      for (const w of p.workers) {
        if (w.isActive) w.isNewborn = false
      }
    })
    this.state.round += 1
    if (this.state.round > 14) {
      this.state.players.forEach((p) => runBeforeEndGameHooks(this.state, p))
      this.state.gameOver = true
      appendImmediateEvents(this.state, [{ type: 'game.ended' }])
      return this.respond()
    }
    return this.continueBeforeStartOfTurn()
  }

  /**
   * Record a single player's card pick for the current draft round. When all
   * seated players have submitted, the round advances (pools rotate) and, once
   * the final round is complete, `finalizeDraft` copies each player's `kept`
   * cards back to `occupationHand` / `minorHand` and flips `phase='playing'`.
   *
   * No-op for non-draft phases, unknown players, out-of-pool picks, or double
   * submits in the same round — each returns `ok:false` with an error message.
   */
  /** S2 Task 12 part 2: thin delegator — body lives in `phases/draft.ts`. */
  submitDraftPick(playerId: string, pick: DraftPickPayload): SessionResponse {
    return draftPhase.submitDraftPick(this, playerId, pick)
  }

  loadState(raw: unknown): SessionResponse {
    let nextState: GameState
    let cursor: EngineStackCursor | null = null
    if (isStateWithCursor(raw)) {
      nextState = raw.state
      cursor = raw.engineStackCursor
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
    this.turnOwnerPlayerIndex = null
    if (cursor && cursor.frames.length > 0) {
      this.restoreEngineStackFromCursor(cursor)
    }
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
      )
    }

    if (result.type === 'request' && result.request.kind === 'choice') {
      // Engine wired the new pending envelope (with promptKey + promptParams);
      // no previous GameCore pending-field mirror needed (Task 10).
      return this.respond()
    }
    if (result.type === 'fail') {
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
    const envelope = this.engineStack.peekPendingEnvelope()
    const frame = this.engineStack.current()
    const farmType = this.isFarmPromptKey(envelope?.promptKey)
    const pendingPlayerIndex = frame && envelope
      ? this.effectiveOwnerIndexForFrame(frame, envelope.hostNodeId, envelope)
      : -1
    if (!farmType || pendingPlayerIndex !== playerIndex) {
      return this.respond(false, 'no pending selection/resource choice for this player')
    }
    if (!this.engine) return this.respond(false, 'no active engine')
    const player = this.state.players[playerIndex]
    const space = this.getSpaceById(this.activeSpaceId)
    if (!player || !space) return this.respond(false, 'invalid state')
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
        }
        break
      case 'room':
        farmPayload = { rooms: payload.rooms ?? [] }
        break
      case 'stable':
        farmPayload = { stables: payload.stables ?? [] }
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
    const envelope = this.engineStack.peekPendingEnvelope()
    const frame = this.engineStack.current()
    const envelopeKind = envelope?.request.kind
    const isPlainChoice = envelopeKind === 'choice'
    const isFarmSelection = envelopeKind === 'farm-select' || (isPlainChoice && !!this.isFarmPromptKey(envelope?.promptKey))
    const isGenericSelection = envelopeKind === 'selection' || (isPlainChoice && !!this.isSelectionPromptKey(envelope?.promptKey))
    const isResourceQuantity = envelopeKind === 'resource-quantity-select'
    const isResourceBatchExchange = envelopeKind === 'resource-batch-exchange-select'
    const pendingPlayerIndex = frame && envelope
      ? this.effectiveOwnerIndexForFrame(frame, envelope.hostNodeId, envelope)
      : -1
    if ((!isFarmSelection && !isGenericSelection && !isResourceQuantity && !isResourceBatchExchange) || pendingPlayerIndex !== playerIndex) {
      return this.respond(false, 'no pending selection/resource choice for this player')
    }
    const player = this.state.players[playerIndex]
    if (!player) return this.respond(false, 'invalid player')
    if (payload.cancel === true && (isFarmSelection || isGenericSelection)) {
      return this.respond(false, 'action cancel is not allowed')
    }

    if (isFarmSelection) {
      return this.resolveFarmSelectionChoice(playerIndex, payload, true)
    }

    // resource-quantity-select 分支：包装 resourceCounts 到 payload，透传到 action.resolveChoice。
    // 与 occupation-hand path `{cards: cardIds}` / farm-position path `{positions: positionStrings}` 风格一致。
    // Generic pre-validation: read availableByResource from envelope, check shape (int, >=0, <= avail)
    // and >=1 total when requireAtLeastOne. Effect-layer bounds remain inside resolveChoice as defense-in-depth.
    if (isResourceQuantity && envelope && envelope.request.kind === 'resource-quantity-select') {
      const availableByResource = envelope.request.availableByResource
      const requireAtLeastOne = envelope.request.requireAtLeastOne ?? false
      const counts = (payload.resourceCounts ?? {}) as Partial<Record<keyof Resource, number>>
      let total = 0
      for (const key of Object.keys(availableByResource) as (keyof Resource)[]) {
        const v = counts[key] ?? 0
        const max = availableByResource[key] ?? 0
        if (!Number.isInteger(v) || v < 0) {
          return this.respond(false, `resource-quantity.error.invalid-count-${String(key)}`)
        }
        if (v > max) {
          return this.respond(false, `resource-quantity.error.invalid-count-${String(key)}`)
        }
        total += v
      }
      if (requireAtLeastOne && total < 1) {
        return this.respond(false, 'resource-quantity.error.must-pick-at-least-one')
      }
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
        )
      }
      this.flushEngineLog()
      this.runEngineSteps()
      if (this.engineStack.peekPendingEnvelope()) return this.respond()
      return this.continueAfterResolvedFarmChoice(playerIndex)
    }

    if (isResourceBatchExchange && envelope && envelope.request.kind === 'resource-batch-exchange-select') {
      const batch = payload.resourceBatchExchange ?? { discard: {}, receive: {} }
      const discard = batch.discard ?? {}
      const receive = batch.receive ?? {}
      const allowedReceive = new Set(envelope.request.receiveResources)
      let discardTotal = 0
      let receiveTotal = 0
      for (const [key, raw] of Object.entries(discard)) {
        const resourceKey = key as keyof Resource
        const value = raw ?? 0
        if (!Number.isInteger(value) || value < 0) {
          return this.respond(false, `resource-batch.error.invalid-discard-${key}`)
        }
        const max = envelope.request.discardAvailableByResource[resourceKey] ?? 0
        if (value > max) {
          return this.respond(false, `resource-batch.error.invalid-discard-${key}`)
        }
        discardTotal += value
      }
      for (const [key, raw] of Object.entries(receive)) {
        const resourceKey = key as keyof Resource
        const value = raw ?? 0
        if (!allowedReceive.has(resourceKey) || !Number.isInteger(value) || value < 0) {
          return this.respond(false, `resource-batch.error.invalid-receive-${key}`)
        }
        receiveTotal += value
      }
      if (discardTotal > envelope.request.maxTotal || receiveTotal > envelope.request.maxTotal) {
        return this.respond(false, 'resource-batch.error.too-many')
      }
      if (discardTotal !== receiveTotal) {
        return this.respond(false, 'resource-batch.error.total-mismatch')
      }
      if ((envelope.request.requireAtLeastOne ?? false) && discardTotal < 1) {
        return this.respond(false, 'resource-batch.error.must-pick-at-least-one')
      }
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
      if (cardIds.length < minSelections) {
        return this.respond(false, 'not enough card selections')
      }
      if (cardIds.length > maxSelections) {
        return this.respond(false, 'too many card selections')
      }
      for (const id of cardIds) {
        if (!player.occupationHand.includes(id)) {
          return this.respond(false, `card ${id} not in occupation hand`)
        }
      }
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
        )
      }
      this.flushEngineLog()
      this.runEngineSteps()
      if (this.engineStack.peekPendingEnvelope()) return this.respond()
      return this.continueAfterResolvedFarmChoice(playerIndex)
    }

    // farm-position (default)
    const positions = payload.positions ?? []
    if (positions.length < minSelections) {
      return this.respond(false, 'not enough selection positions')
    }
    if (positions.length > maxSelections) {
      return this.respond(false, 'too many selection positions')
    }
    const selectedKeys = new Set<string>()
    for (const pos of positions) {
      const key = `${pos.row}-${pos.col}`
      if (selectedKeys.has(key)) return this.respond(false, 'duplicate selection position')
      selectedKeys.add(key)
      const exists = player.fields.some((f) => f.row === pos.row && f.col === pos.col)
      if (!exists) return this.respond(false, 'invalid field position')
    }
    const selectableTiles = Array.isArray(interactionContext?.selectableTiles)
      ? interactionContext.selectableTiles as FarmTilePosition[]
      : null
    if (selectableTiles) {
      const selectableKeys = new Set(selectableTiles.map((pos) => `${pos.row}-${pos.col}`))
      for (const pos of positions) {
        if (!selectableKeys.has(`${pos.row}-${pos.col}`)) {
          return this.respond(false, 'invalid selection position')
        }
      }
    }
    const allowedSelectionCounts = Array.isArray(interactionContext?.allowedSelectionCounts)
      ? interactionContext.allowedSelectionCounts
          .filter((count): count is number => typeof count === 'number' && Number.isInteger(count))
      : null
    if (allowedSelectionCounts && !allowedSelectionCounts.includes(positions.length)) {
      return this.respond(false, 'invalid selection count')
    }

    this.pushHistory()
    const positionStrings = positions.map((p) => `${p.row}-${p.col}`)
    const space = this.getSpaceById(this.activeSpaceId!) ?? this.createSyntheticSpace('selection')
    const result = this.engine?.resolveChoice('confirm', {
      ...this.buildEngineExecutionContext(this.state.players[playerIndex]!, space),
    }, { positions: positionStrings })
    if (result?.type === 'ok') {
      this.recordActionResultDetails(
        result,
        this.currentFrameOwnerPlayerId(player.id),
        player.id,
      )
    }
    this.flushEngineLog()
    this.runEngineSteps()
    if (this.engineStack.peekPendingEnvelope()) return this.respond()
    return this.continueAfterResolvedFarmChoice(playerIndex)
  }

  devSetResources(playerIndex: number, resources: Record<string, number>): SessionResponse {
    const player = this.state.players[playerIndex]
    if (!player) return this.respond(false, 'player not found')
    const animalKeys = new Set(['sheep', 'boar', 'cattle'])
    let increasedAnimals = false
    Object.entries(resources).forEach(([key, value]) => {
      if (typeof value === 'number') {
        const resourceBag = player.resources as Record<string, number>
        const priorValue = resourceBag[key] ?? 0
        resourceBag[key] = value
        if (animalKeys.has(key) && value > priorValue) increasedAnimals = true
      }
    })
    if (increasedAnimals) {
      this.startTopLevelReorganizeFlow(playerIndex)
    }
    return this.respond()
  }

  devSetRound(round: number): SessionResponse {
    this.state.round = round
    return this.respond()
  }

  devSetCurrentPlayer(playerIndex: number): SessionResponse {
    if (playerIndex < 0 || playerIndex >= this.state.players.length) {
      return this.respond(false, 'invalid player index')
    }
    this.state.currentPlayerIndex = playerIndex
    return this.respond()
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

  devDrawCard(playerIndex: number, cardId: string): SessionResponse {
    const player = this.state.players[playerIndex]
    if (!player) return this.respond(false, 'player not found')
    const isOccupation = this.isOccupationCard(cardId)
    // Remove from all players' hands first
    for (const p of this.state.players) {
      p.minorHand = p.minorHand.filter(id => id !== cardId)
      p.occupationHand = p.occupationHand.filter(id => id !== cardId)
    }
    if (isOccupation) {
      player.occupationHand.push(cardId)
    } else {
      player.minorHand.push(cardId)
    }
    return this.respond(true, undefined, [
      {
        schemaVersion: 1,
        type: 'private.handChanged',
        recipientPlayerId: player.id,
        cardIds: [cardId],
        cardType: isOccupation ? 'occupation' : 'minor',
        reason: 'dev-draw-card',
      },
    ])
  }

  devPlayCard(playerIndex: number, cardId: string): SessionResponse {
    const player = this.state.players[playerIndex]
    if (!player) return this.respond(false, 'player not found')
    const isOccupation = this.isOccupationCard(cardId)
    if (isOccupation) {
      player.occupationHand = player.occupationHand.filter((id) => id !== cardId)
      if (!player.occupationPlayed.includes(cardId)) {
        player.occupationPlayed.push(cardId)
      }
    } else {
      player.minorHand = player.minorHand.filter((id) => id !== cardId)
      if (!player.minorPlayed.includes(cardId)) {
        player.minorPlayed.push(cardId)
      }
    }
    getCardModifiers(cardId).forEach((modifier) => {
      if (!player.activeModifiers.some((m) => JSON.stringify(m) === JSON.stringify(modifier))) {
        player.activeModifiers.push(modifier)
      }
    })
    // Trigger onBuy hook (creates PlayerActionCard action spaces, etc.)
    runCardEffectHook(this.state, player, cardId, 'onBuy')
    this.syncDynamicActionSpaces()
    return this.respond()
  }

  devSetSpaceTaken(spaceId: string, playerId: string | null): SessionResponse {
    const space = this.state.actionSpaces.find((s) => s.id === spaceId)
    if (!space) return this.respond(false, 'space not found')
    if (!playerId) {
      space.takenBy = []
    } else {
      const player = this.state.players.find((p) => p.id === playerId)
      const worker = player ? smallestAvailableWorker(this.state, player) : null
      space.takenBy = [{ playerId, workerId: worker?.id ?? '1' }]
    }
    return this.respond()
  }

  devAddRooms(playerIndex: number, rooms: FarmTilePosition[]): SessionResponse {
    const player = this.state.players[playerIndex]
    if (!player) return this.respond(false, 'player not found')
    player.roomTiles = [...player.roomTiles, ...rooms]
    player.rooms = (player.rooms || 0) + rooms.length
    return this.respond()
  }

  undoStep(): SessionResponse {
    const envelope = this.engineStack.peekPendingEnvelope()
    const interactionFrame = this.engineStack.current()
    // Farm-select kind carries the same promptKey shape as the previous
    // choice farm prompts, so the history-restore undo path applies to both.
    const isPlainChoiceOrFarmSelect =
      envelope &&
      (envelope.request.kind === 'choice' ||
        envelope.request.kind === 'farm-select')
    const farmPrompt = isPlainChoiceOrFarmSelect ? this.isFarmPromptKey(envelope.promptKey) : null
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
    return this.applyPreparedPublicEventCancellation(beforeArchive, cancellationPlan)
  }

  undoAction(): SessionResponse {
    if (this.actionStartIndex === null) return this.respond(false, 'no action snapshot')
    let targetIndex = this.actionStartIndex
    for (let i = this.history.length - 1; i > this.actionStartIndex; i -= 1) {
      if (this.history[i]?.undoBoundary) {
        targetIndex = i
        break
      }
    }
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
    if (targetIndex === this.actionStartIndex) {
      this.actionStartIndex = null
    } else {
      this.recomputeActionStartIndex()
    }
    return this.applyPreparedPublicEventCancellation(beforeArchive, cancellationPlan)
  }
}
