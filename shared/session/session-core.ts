import type {
  ActionFlow,
  ActionSpace,
  AnytimeAction,
  FarmTilePosition,
  FeedQueueEntry,
  GameState,
  InteractionCommand,
  InteractionFarmSelection,
  InteractionRequest,
  InteractionSelection,
  InteractionState,
  PendingAction,
  PlayerState,
  Resource,
  InteractionAnimalReorgZone,
} from '../game/types.ts'
import type { ActionDetailParts } from '../protocol/game.ts'
import { actionDefinitions, getActionDefinition } from '../actions/index.ts'
import { internalActionDefinitions } from '../actions/internal-actions.ts'
import { clearActionHooks } from '../actions/hooks.ts'
import { finalizeDraft } from '../draft/draft-manager.ts'
import type { DraftPickPayload } from '../draft/types.ts'
import {
  ActionNode,
  ActionRegistry,
  EngineStack,
  INTERACTION_ONLY_ACTION_ID,
  InteractionNode,
  Engine,
  EngineTree,
  HookDispatcher,
  LogStore,
  OptionalNode,
  OrNode,
  ParallelNode,
  PlayerSwitchNode,
  SequenceNode,
  XorNode,
  isSyntheticInteractionFrame,
} from '../engine/index.ts'
import type { EngineFrame, EngineNode, EngineSource, EngineStackCursor, SubFlowReason } from '../engine/index.ts'
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
} from '../logic/state.ts'
import { clearWorkPhaseBuildingResources } from '../logic/work-phase-resources.ts'
import {
  addFoodFromConversion,
  incFirstPlayer,
  incHarvestedGrain,
  incHarvestedVegetable,
  incResourceConverted,
} from '../logic/stats.ts'
import { getMinorImprovement } from '../game/minor-improvements.ts'
import {
  registerCustomCard,
  getCustomMinorImprovementIds,
  getCustomOccupationIds,
} from '../cards/custom-registry.ts'
import { type CustomCardData, SessionCardContext, withSessionContext } from '../cards/session-card-context.ts'
import { CardRegistry, type CardImpl } from '../cards/registry.ts'
import { getActiveCardRegistry, setActiveCardRegistry } from '../cards/active-registry.ts'
import { ALL_CARD_IMPLS } from '../cards/register-all.ts'
import { allOccupationCards, allMinorImprovementCards } from '../cards/catalog.ts'
import { majorCardDefinitions } from '../cards/major/index.ts'
import * as setupPhase from './phases/setup.ts'
import * as roundPhase from './phases/round.ts'
import * as harvestPhase from './phases/harvest.ts'
import * as draftPhase from './phases/draft.ts'
import { getCardModifiers } from '../cards/card-modifiers.ts'
import { getCardEffect } from '../cards/card-effects.ts'
import { incCardUsed } from '../cards/helpers/card-state.ts'
import type { CardEffectHook } from '../cards/card-effects.ts'
import { runRoundEndHooks, runBeforeFeedHooks, runAfterFeedHooks, runCardEffectHook, runBeforeEndGameHooks } from '../cards/card-effects.ts'
import { positionKey } from '../game/farm.ts'
import { getMatchingListeners, executeCardListener, shouldSkipImmediateListenerLog } from '../cards/card-listeners.ts'
import { computeScores, type PlayerScoreSummary } from '../logic/scoring.ts'
import { computeAnimalZones } from '../actions/helpers/animal-zones'
import { reap } from '../actions/effects/reap.ts'
import { breedLeaf } from '../actions/effects/breed'
import { releaseWorkerFromCard } from '../cards/helpers/card-held-workers.ts'
import { resetRoundPlacements } from '../cards/helpers/round-placement.ts'
import { familySize, newbornCount, workersAvailable } from '../game/player.ts'
import { getAssignedAnimalCount } from '../game/animals.ts'
import { getRegisteredMinorImprovement, getRegisteredOccupation } from '../cards/types.ts'
import { getExchangesInWindow } from '../actions/effects/exchange.ts'
import { getMajorCard } from '../cards/major/index.ts'
import {
  BASIC_CONVERSION_SOURCE_ID,
  getBasicConversionExchange,
} from '../cards/basic-conversion.ts'
import {
  applyTradeSideEffect,
} from '../actions/helpers/payment'
import {
  isMajorImprovementPlayable,
  isMinorImprovementPlayable,
} from '../actions/effects/improvement.ts'
import {
  getOccupationActionCost,
  isOccupationPlayable,
} from '../actions/effects/occupation.ts'
import {
  getFenceCount,
  getPalisadeCount,
} from '../actions/effects/fencing.ts'
import {
  buildFarmPositionSelectionInteraction,
  buildFenceFarmInteraction,
  buildPlowFarmInteraction,
  buildRoomFarmInteraction,
  buildSowFarmInteraction,
  buildStableFarmInteraction,
} from '../logic/farm/farm-interaction.ts'
import { buildOccupationHandSelectionInteraction } from '../logic/farm/occupation-hand-interaction.ts'
import { rebuildActiveModifiers } from '../game/serialization.ts'
import { isSpaceOccupied, removeWorkerRef } from '../game/space.ts'
import { smallestAvailableWorker } from '../game/player.ts'
import { computeAllowedPlacementSpaces } from '../actions/helpers/placement-availability.ts'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../actions/helpers/placement-constants.ts'

/**
 * Synthetic action-space ID prefix for sub-flow frames pushed onto the
 * engine stack (e.g. reorganize, future feed/confirm sub-flows). Centralised
 * here so `getSpaceById` can recognise sub-flow IDs without matching every
 * leading underscore.
 */
const SUBFLOW_SPACE_PREFIX = '__subflow:' as const

const subflowSpaceId = (reason: SubFlowReason): string =>
  `${SUBFLOW_SPACE_PREFIX}${reason}`

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

type HistoryEntry = {
  state: GameState
  pending: PendingAction
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
  pending: PendingAction
  interaction: InteractionState
  historyLength: number
  hasActionStartSnapshot: boolean
  scores?: PlayerScoreSummary[]
  pastureCapacities?: Record<string, Record<string, number>>
  actionAvailability?: Record<string, boolean>
  cardAvailability?: Record<string, boolean>
  error?: string
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
   * The registry is published via `setActiveCardRegistry` so that any legacy
   * `registerCardListener` / `registerCardEffect` calls issued later (e.g.
   * custom-code cards at runtime) forward into this session's registry.
   */
  cardRegistry?: CardRegistry
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
  /**
   * Accumulates resource gains/costs already attributed to specific cards via
   * `log.cardEffectGain` / `log.cardEffectPay` since the last leaf-flush.
   * `flushLeafActionDetail` subtracts these from the leaf's delta so card
   * effects don't get double-counted in the action's `log.actionDetail`.
   */
  private cardEffectDeltasSinceFlush: { gains: Partial<Resource>; costs: Partial<Resource> } = {
    gains: {},
    costs: {},
  }
  /**
   * Monotonic counter for two purposes:
   *   1. `recordActionSnapshot(player, n)` — per-player action token used by
   *      undo/replay to label whose turn produced each player snapshot.
   *   2. `nextSyntheticNodeId(prefix)` — generates `${prefix}-${n}` ids for
   *      synthetic InteractionNodes (`startConfirmNextPlayer` etc.).
   *
   * Cursor restore (Task 9 / I-2): cursor.choiceData.id carries the original
   * synthetic id (e.g. `interaction:feed-7`); after `loadState` the freshly-
   * constructed `GameCore` resets `nextActionToken` to 1, so the next
   * `startConfirm*` call mints `interaction:confirm-next-player-1`.
   * Collisions on synthetic *node ids* are impossible because each id lives
   * on a separate `Engine` instance (one per stack frame) and
   * `injectInteraction` replaces the engine tree's root wholesale.
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
  /** @internal phase access — current pending InteractionNode if any. */
  peekEngineInteraction(): InteractionNode | null { return this.engineStack.peekInteraction() }
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

  /** @internal phase access — reset per-leaf card-effect resource deltas. */
  resetCardEffectDeltas(): void { this.cardEffectDeltasSinceFlush = { gains: {}, costs: {} } }

  /** @internal phase access — emit a SessionResponse with the current state. */
  emitResponse(ok = true, error?: string): SessionResponse { return this.respond(ok, error) }

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
  /** @internal phase access — synthetic InteractionNode id generator. */
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
  buildAdhocEngineFrame(actionId: string, sourceCard: string | undefined): {
    engine: import('../engine').Engine; source: EngineSource
  } {
    const flow: ActionFlow = { type: 'leaf', actionId, sourceCard }
    return { engine: this.createFlowEngine(flow), source: { kind: 'flow', flow } }
  }
  /** @internal Round phase — enumerate currently-available anytime entries for the active interaction context. */
  listAnytimeEntries(): { descriptor: AnytimeAction; flow: ActionFlow }[] { return this.buildAnytimeEntries() }
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
  /** @internal phase access — build a fresh Engine for a top-level action space. */
  createEngineForSpace(actionId: string): Engine { return this.createEngine(actionId) }
  /** @internal phase access — push a synthetic interaction-only frame. */
  pushSyntheticInteractionFrame(node: InteractionNode, ownerPlayerIndex: number, reason: SubFlowReason): void {
    this.pushInteractionFrame(node, ownerPlayerIndex, reason)
  }

  private registry: ActionRegistry
  private hookDispatcher: HookDispatcher
  private engineLog: LogStore
  private sessionCardContext: SessionCardContext | null = null
  private readonly registerCustomCardImpl: (data: CustomCardData) => void
  private readonly cardRegistry: CardRegistry
  readonly cardWarnings: string[] = []

  constructor(options: GameCoreOptions = {}) {
    const { stateOrSeed, customCards, initialStateOptions, registerCustomCardImpl } = options
    this.registerCustomCardImpl = registerCustomCardImpl ?? (() => {
      // No-op default: used in sandbox mode (browser) or tests that don't need
      // the server-side executor-backed registrar.
    })
    this.registry = new ActionRegistry()
    actionDefinitions.forEach((a) => this.registry.register(a))
    internalActionDefinitions.forEach((a) => this.registry.register(a))
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
    // Replaces the legacy card-modifiers.ts catalog-direct-query path; downstream
    // callers (`getCardModifiers`) read from `active.getModifiers` only.
    this.cardRegistry.syncModifiersFromCatalog(
      allOccupationCards,
      allMinorImprovementCards,
    )
    // Register majors as effect bundles so getCardEffect resolves them after
    // the legacy getMajorCardEffect fallback is removed.
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
    this.engineStack = EngineStack.fromCursor(cursor, (source, snapshot) => {
      const engine = this.createEngineFromSource(source)
      engine.restore(snapshot)
      return engine
    })
    // Capture the pre-`runEngineSteps` interaction node id so the dev-only
    // assert below can detect a non-idempotent `proceed()` (Task 8 reviewer
    // Important): if `runEngineSteps` advances the interaction node out from
    // under the freshly-restored cursor we silently lose the client's
    // already-shown prompt and the next ServerEvent surfaces a different
    // request. The assert is a cheap canary — it has no production cost
    // because the comparison is a string equality.
    const preRestoreNodeId = this.engineStack.peekInteraction()?.id ?? null
    // Task 10: `this.pending` is gone — every consumer derives the legacy
    // PendingAction shape from `engineStack.peekInteraction()` via
    // `getCurrentPending()`. No dual-write rebuild is needed; the
    // InteractionNode survived the cursor round-trip with its `request` and
    // `choices` intact, which is the single source of truth.
    //
    // Re-run engine steps so the freshly-restored frame proceeds through any
    // already-emitted choice node. `proceed()` is idempotent on a still-
    // pending InteractionNode (it re-emits `step.type === 'choice'`), so the
    // canonical pre/post node-id assert below catches drift.
    this.runEngineSteps()
    // Cross-platform NODE_ENV check that works in both Node (server) and
    // browser (esbuild-style `process.env.NODE_ENV` replacement). Vite/Rollup
    // shim `process.env.NODE_ENV` for browser bundles, while Node has the
    // real `process`; both expose the value via this guarded access.
    const env =
      (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV
    if (env !== 'production') {
      const postRestoreNodeId = this.engineStack.peekInteraction()?.id ?? null
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
  getCustomCardDefs(): import('../protocol/game.ts').CustomCardDef[] {
    return setupPhase.getCustomCardDefs(this.sessionCardContext)
  }

  /** Update a player's display name in the game state (called after WS join). */
  updatePlayerName(playerIndex: number, name: string): void {
    setupPhase.updatePlayerName(this.state.players[playerIndex], name)
  }

  private buildEngineNode(flow: ActionFlow, counter: { value: number }): EngineNode {
    if (flow.type === 'playerSwitch') {
      return new PlayerSwitchNode(`ps-${counter.value++}`, flow.targetPlayerId)
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
          new InteractionNode(`choice-${flow.actionId}-${counter.value++}`, []),
        ])
        return flow.optional ? new OptionalNode(`opt-${counter.value++}`, seq, flow.promptKey) : seq
      }
      return flow.optional
        ? new OptionalNode(`opt-${counter.value++}`, actionNode, flow.promptKey)
        : actionNode
    }

    const children = flow.children.map((child) => this.buildEngineNode(child, counter))
    if (flow.type === 'seq') {
      const seq = new SequenceNode(`seq-${counter.value++}`, children)
      return flow.optional ? new OptionalNode(`opt-${counter.value++}`, seq, flow.promptKey) : seq
    }
    if (flow.type === 'parallel') {
      const parallel = new ParallelNode(`par-${counter.value++}`, children)
      return flow.optional
        ? new OptionalNode(`opt-${counter.value++}`, parallel, flow.promptKey)
        : parallel
    }
    if (flow.type === 'xor') {
      const xor = new XorNode(`xor-${counter.value++}`, children, flow.promptKey)
      return flow.optional ? new OptionalNode(`opt-${counter.value++}`, xor, flow.promptKey) : xor
    }
    const or = new OrNode(`or-${counter.value++}`, children, flow.promptKey)
    return flow.optional ? new OptionalNode(`opt-${counter.value++}`, or, flow.promptKey) : or
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
    const counter = { value: 0 }
    const nodes: EngineNode[] = []
    for (const entry of matched) {
      const result = executeCardListener(entry.registration, context, {
        ownerPlayerId: entry.ownerPlayerId,
      })
      // Track BGA-style per-card `used` stat for the owner of the card whose
      // listener actually produced an effect. This place-farmer 'after' path
      // bypasses ActivateCardNode, so we book-keep here directly.
      if (result && entry.cardId) {
        const owner =
          this.state.players.find((candidate) => candidate.id === entry.ownerPlayerId) ?? player
        incCardUsed(owner, entry.cardId)
      }
      if (!result?.flow) continue
      if (result.logKey && !shouldSkipImmediateListenerLog(result)) {
        const logPlayer =
          this.state.players.find((candidate) => candidate.id === entry.ownerPlayerId) ?? player
        this.state.log.unshift({
          key: result.logKey,
          params: { player: logPlayer.name, ...result.logParams },
        })
      }
      const flowNode = this.buildEngineNode(result.flow, counter)
      const needsSwitch = entry.ownerPlayerId && entry.ownerPlayerId !== player.id
      if (needsSwitch) {
        nodes.push(
          new PlayerSwitchNode(`pf-ps-to-${counter.value++}`, entry.ownerPlayerId),
          flowNode,
          new PlayerSwitchNode(`pf-ps-back-${counter.value++}`, player.id),
        )
      } else {
        nodes.push(flowNode)
      }
    }
    if (nodes.length === 0) return false
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

  private createFlowEngine(flow: ActionFlow): Engine {
    const counter = { value: 0 }
    return new Engine({
      tree: new EngineTree(this.buildEngineNode(flow, counter)),
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
      engine: this.createFlowEngine(flow),
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

  /**
   * Synthetic frame factory used by the start*-confirm/start*-feed triggers.
   * Pushes an `__interaction_only__` leaf flow frame, then immediately
   * `injectInteraction(node)` so the engine yields the request via
   * `peekInteraction()`. Frame deserialization (cursor round-trip) recreates
   * the same shape via `Engine.restore`'s synthetic-frame branch.
   */
  private pushInteractionFrame(
    node: InteractionNode,
    ownerPlayerIndex: number,
    reason: SubFlowReason,
  ): void {
    const flow: ActionFlow = { type: 'leaf', actionId: INTERACTION_ONLY_ACTION_ID }
    const engine = this.createFlowEngine(flow)
    engine.injectInteraction(node)
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

  /** S2 Task 10: thin delegators — bodies live in `phases/round.ts`. */
  private startConfirmNextPlayer(nextPlayerIndex: number): void {
    roundPhase.startConfirmNextPlayer(this, nextPlayerIndex)
  }
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

  private createEngine(actionId: string): Engine {
    const action = this.registry.get(actionId)
    const counter = { value: 0 }
    const an = new ActionNode(`action-${actionId}`, actionId)
    const root = action?.flow
      ? this.buildEngineNode(action.flow, counter)
      : action?.resolveChoice
        ? new SequenceNode(`seq-${actionId}`, [an, new InteractionNode(`choice-${actionId}`, [])])
        : an
    return new Engine({
      tree: new EngineTree(root),
      registry: this.registry,
      hooks: this.hookDispatcher,
      log: this.engineLog,
    })
  }

  private createEngineFromSource(source: EngineSource): Engine {
    return source.kind === 'action'
      ? this.createEngine(source.actionId)
      : this.createFlowEngine(source.flow)
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

  private nextPlayerIdx(players: PlayerState[], current: number) {
    return roundPhase.nextSeatedPlayerIdx(this.state, players, current)
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
    this.state.log.unshift({
      key,
      params: {
        player: player.name,
        resources,
      },
    })
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
    if (this.activePlayerIndex === null || !this.activeSpaceId) return null
    const player = this.state.players[this.activePlayerIndex]
    const space = this.getSpaceById(this.activeSpaceId)
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
    return buildRoomFarmInteraction(player, costOverride, actionContext)
  }

  private buildStableInteraction(
    player: PlayerState,
    costOverride?: Partial<Resource>,
    actionContext?: Record<string, unknown>,
  ): InteractionFarmSelection {
    const zoneFilter = actionContext?.zoneFilter
    const max = actionContext?.max
    return buildStableFarmInteraction(player, costOverride, {
      zoneFilter: zoneFilter === 'pasture-1' ? 'pasture-1' : undefined,
      max: typeof max === 'number' ? max : undefined,
    })
  }

  private buildPlowInteraction(player: PlayerState, costOverride?: Partial<Resource>): InteractionFarmSelection {
    return buildPlowFarmInteraction(player, costOverride)
  }

  private buildSowInteraction(player: PlayerState): InteractionFarmSelection {
    const actionContext = this.getActionContextFromTopFrame()
    return buildSowFarmInteraction(player, actionContext)
  }

  /**
   * Refactored from `buildFenceInteraction(pending)` to take the
   * InteractionNode + player directly (Task 10: `this.pending` deleted).
   * `buildFenceFarmInteraction` historically destructured `pending.options`
   * and `pending.costOverride` — we synthesize an equivalent shape from the
   * node + frame engine context.
   */
  private buildFenceInteractionFromNode(
    node: InteractionNode,
    player: PlayerState,
  ): InteractionFarmSelection {
    const frame = this.engineStack.current()
    const ctx = this.getActionContextFromTopFrame()
    const choiceLikeShim: Extract<PendingAction, { type: 'choice' }> = {
      type: 'choice',
      playerIndex: frame?.ownerPlayerIndex ?? 0,
      spaceId: frame?.spaceId ?? '',
      options: (node.request?.kind === 'choice' ? node.request.options : node.choices) ?? [],
      promptKey: node.promptKey,
      promptParams: node.promptParams,
      costOverride: frame?.engine.getLastComputedCosts(),
      sourceCard: frame?.engine.getPendingInteractionContext()?.sourceCard,
      actionContext: ctx,
    }
    return buildFenceFarmInteraction(player, choiceLikeShim)
  }

  private buildSelectionInteractionFromNode(
    _node: InteractionNode,
    player: PlayerState,
  ): InteractionSelection {
    const actionContext = this.getActionContextFromTopFrame()
    const kind = (actionContext?.selectionKind as string | undefined) ?? 'farm-position'
    if (kind === 'occupation-hand') {
      return buildOccupationHandSelectionInteraction(player, actionContext)
    }
    return buildFarmPositionSelectionInteraction(player, actionContext)
  }

  private buildFarmInteractionFromNode(
    node: InteractionNode,
    player: PlayerState,
  ): InteractionFarmSelection | null {
    const farmType = this.isFarmPromptKey(node.promptKey)
    if (!farmType) return null
    const ctx = this.getActionContextFromTopFrame()
    const costOverride = this.engineStack.current()?.engine.getLastComputedCosts()
    switch (farmType) {
      case 'fence':
        return this.buildFenceInteractionFromNode(node, player)
      case 'room':
        return this.buildRoomInteraction(player, costOverride, ctx)
      case 'stable':
        return this.buildStableInteraction(player, costOverride, ctx)
      case 'plow':
        return this.buildPlowInteraction(player, costOverride)
      case 'sow':
        return this.buildSowInteraction(player)
      default:
        return null
    }
  }

  /**
   * Read-through helper for the engine's `pendingInteractionContext.actionContext`
   * on the current engine-stack frame. Replaces the legacy `this.pending.actionContext`
   * accessor (Task 10).
   */
  private getActionContextFromTopFrame(): Record<string, unknown> | undefined {
    return this.engineStack.current()?.engine.getPendingInteractionContext()?.actionContext
  }

  private buildAnytimeEntries(): { descriptor: AnytimeAction; flow: ActionFlow }[] {
    if (this.stageResume) return []
    const context = this.getActiveInteractionContext()
    if (!context) return []
    // Suppress anytime entries while a feed sub-flow is awaiting input.
    // Detect via the InteractionNode's typed `request.kind` (R2 strong-typing).
    const interactionNode = this.engineStack.peekInteraction()
    const interactionKind = interactionNode?.request?.kind
    if (interactionKind === 'feed') {
      return []
    }
    // Suppress anytime entries while a reorganize sub-flow is awaiting input.
    if (interactionKind === 'animal-reorg') {
      return []
    }
    // Suppress anytime actions during sub-choice resolution (e.g. bake-bread, exchange)
    // to avoid recursive anytime interrupts.
    const promptKey = interactionNode?.promptKey
    if (
      interactionNode &&
      promptKey &&
      (promptKey.startsWith('ui.interactionBakeBread') ||
       promptKey.startsWith('ui.interactionExchange'))
    ) {
      return []
    }
    const { player, space } = context
    const anytimeEntries: { descriptor: AnytimeAction; flow: ActionFlow }[] = []
    // Auto-discover anytime actions from registry instead of hardcoding
    for (const action of this.registry.values()) {
      if (!action.anytime) continue
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
    const anytimeContext: import('../cards/card-listeners').CardListenerContext = {
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
    return computeAnimalZones(player).map((zone) => ({
      id: zone.id,
      zoneType: zone.zoneType as 'pasture' | 'house' | 'stable',
      animalType: (zone.animalType as 'sheep' | 'boar' | 'cattle' | null) ?? null,
      animalCount: zone.animalCount ?? 0,
      capacity: zone.capacity,
    }))
  }

  /**
   * Derive the client-facing `InteractionState` from the current engine
   * stack. Replaces the legacy pending-driven implementation (Task 10):
   * `engineStack.peekInteraction()` + `engineStack.current()` is now the
   * single source of truth. Draft phase is handled in `respond()` (which
   * passes the cardDraft pending into a separate code path).
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
    const node = this.engineStack.peekInteraction()
    // Fallback for composite-node pending choices (OrNode / XorNode /
    // OptionalNode): the engine has a pending choice but no InteractionNode
    // wraps it. Surface the cached options so the wait+choice shape works.
    const composite = !node ? frame?.engine.peekPendingChoiceFromComposite() ?? null : null

    if (!frame || (!node && !composite)) {
      const anytimeActions = this.buildAnytimeEntries().map((entry) => entry.descriptor)
      return {
        stateId: 'idle',
        allowedCommands: ['takeAction', 'undoStep', 'undoAction'],
        anytimeActions,
      }
    }

    const playerIndex = frame.ownerPlayerIndex
    const spaceId = frame.spaceId
    const promptKey = node?.promptKey ?? composite?.promptKey
    const promptParams = node?.promptParams ?? composite?.promptParams
    const ctx = frame.engine.getPendingInteractionContext()
    const sourceCard = ctx?.sourceCard
    const costOverride = frame.engine.getLastComputedCosts()

    // Resolve the InteractionRequest for the wait state. node.request is the
    // primary source; composite-fallback synthesises a `choice` request from
    // the cached options.
    const request: InteractionRequest =
      node?.request ??
      ({ kind: 'choice', options: composite?.options ?? node?.choices ?? [] } as InteractionRequest)
    const choiceOptions =
      request.kind === 'choice'
        ? request.options
        : (node?.choices ?? composite?.options ?? [])
    const player = this.state.players[playerIndex]
    const anytimeActions = this.buildAnytimeEntries().map((entry) => entry.descriptor)

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
          zones: player ? this.buildAnimalReorgZones(player) : [],
          allowedCommands: ['resolveChoice', 'undoStep', 'undoAction'],
          anytimeActions: [],
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
          allowedCommands: ['confirmNextPlayer', 'undoStep', 'undoAction'],
          anytimeActions: [],
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
          allowedCommands: ['confirmPlayerSwitch', 'undoStep', 'undoAction'],
          anytimeActions: [],
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
          allowedCommands: ['confirmFeed', 'undoStep', 'undoAction'],
          anytimeActions: [],
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
          allowedCommands: ['resolveChoice', 'commitFarm', 'takeAnytimeAction', 'undoStep', 'undoAction'],
          anytimeActions,
        }
      case 'choice':
      default: {
        const selectionKind = this.isSelectionPromptKey(promptKey)
        if (node && selectionKind && player) {
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
            selection: this.buildSelectionInteractionFromNode(node, player),
            allowedCommands: ['resolveChoice', 'commitSelection', 'takeAnytimeAction', 'undoStep', 'undoAction'],
            anytimeActions,
          }
        }
        const farm = node && player ? this.buildFarmInteractionFromNode(node, player) : null
        const allowedCommands: InteractionCommand[] = farm
          ? ['resolveChoice', 'commitFarm', 'takeAnytimeAction', 'undoStep', 'undoAction']
          : ['resolveChoice', 'takeAnytimeAction', 'undoStep', 'undoAction']
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
            anytimeActions,
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
          anytimeActions,
        }
      }
    }
  }

  private computeWinnerIds(): string[] {
    const summary = computeScores(this.state)
    if (summary.length === 0) return []
    const top = summary.reduce((a, b) => (a.total >= b.total ? a : b))
    return summary.filter((s) => s.total === top.total).map((s) => s.playerId)
  }

  private computeScoreSummary() {
    return computeScores(this.state).map((s) => ({ playerId: s.playerId, total: s.total }))
  }

  private computeCardDraftPending(): Extract<PendingAction, { type: 'cardDraft' }> | null {
    return draftPhase.computeCardDraftPending(this.state)
  }

  private respond(ok = true, error?: string): SessionResponse {
    // While the top-level game phase is 'draft', surface a cardDraft pending
    // and an idle interaction (the client uses DraftOverlay for picks).
    const draftPending = this.computeCardDraftPending()
    const effectivePending: PendingAction = draftPending ?? this.getCurrentPending()
    const interaction: InteractionState = draftPending
      ? { stateId: 'idle', allowedCommands: [], anytimeActions: [] }
      : this.buildInteraction()
    const resp: SessionResponse = {
      ok,
      state: this.state,
      pending: effectivePending,
      interaction,
      historyLength: this.history.length,
      hasActionStartSnapshot: this.actionStartIndex !== null,
      scores: computeScores(this.state),
      pastureCapacities: this.getPastureCapacities(),
    }
    // Include backend-computed availability for current player
    if (!this.state.gameOver && effectivePending.type === 'none') {
      const actionAvailability = this.getActionAvailability(this.state.currentPlayerIndex)
      resp.actionAvailability = actionAvailability
      resp.cardAvailability = this.getCardAvailability(
        this.state.currentPlayerIndex,
        actionAvailability,
      )
    }
    if (error) resp.error = error
    return resp
  }

  private clonePending(pending: PendingAction): PendingAction {
    if (typeof structuredClone === 'function') {
      try {
        return structuredClone(pending)
      } catch {
        return JSON.parse(JSON.stringify(pending)) as PendingAction
      }
    }
    return JSON.parse(JSON.stringify(pending)) as PendingAction
  }

  /**
   * Derive the legacy `PendingAction` shape from the current engine-stack
   * state. Replaces the deleted `this.pending` field (Task 10): every read
   * site that previously consulted `this.pending.<x>` should now go through
   * either this helper (for full PendingAction values — `respond()` /
   * `pushHistory()`) or directly through `engineStack.peekInteraction()` /
   * `engineStack.current()` (for individual fields, faster path).
   *
   * Mapping:
   *   - no InteractionNode on top frame -> `{ type: 'none' }`
   *   - request.kind === 'choice' / 'animal-reorg' -> `{ type: 'choice', ... }`
   *     (animal-reorg is surfaced as a `choice` PendingAction by today's
   *     transitional client contract — Task 11 will codemod the reorg-aware
   *     test sites; the InteractionState surfaced via `buildInteraction`
   *     already returns `stateId: 'animalReorg'` to clients.)
   *   - request.kind === 'confirm-next-player' -> `{ type: 'confirmNextPlayer' }`
   *   - request.kind === 'confirm-player-switch' -> `{ type: 'confirmPlayerSwitch' }`
   *   - request.kind === 'feed' -> `{ type: 'harvestFeed', ... }`
   *
   * Draft phase short-circuits to `{ type: 'cardDraft' }` regardless of the
   * stack — `respond()` overlays this value onto the response.
   */
  private getCurrentPending(): PendingAction {
    const frame = this.engineStack.current()
    if (!frame) {
      return { type: 'none' }
    }
    const node = this.engineStack.peekInteraction()
    const ctx = frame.engine.getPendingInteractionContext() ?? null
    const playerIndex = frame.ownerPlayerIndex
    const spaceId = frame.spaceId
    if (node) {
      const request = node.request
      if (request?.kind === 'confirm-next-player') {
        return { type: 'confirmNextPlayer', nextPlayerIndex: request.nextPlayerIndex }
      }
      if (request?.kind === 'confirm-player-switch') {
        return {
          type: 'confirmPlayerSwitch',
          fromPlayerIndex: request.fromPlayerIndex,
          toPlayerIndex: request.toPlayerIndex,
        }
      }
      if (request?.kind === 'feed') {
        return {
          type: 'harvestFeed',
          playerIndex,
          remaining: request.remaining,
          foodUsed: request.foodUsed,
          feedQueue: request.feedQueue,
        }
      }
      // 'choice' (typed) and 'animal-reorg' (legacy choice path) and any
      // ChoiceNode-emitted untyped request all surface as the legacy
      // `{ type: 'choice', ... }` PendingAction.
      const options = request?.kind === 'choice' ? request.options : node.choices
      return {
        type: 'choice',
        playerIndex,
        spaceId,
        options,
        promptKey: node.promptKey,
        promptParams: node.promptParams,
        costOverride: frame.engine.getLastComputedCosts(),
        sourceCard: ctx?.sourceCard ?? undefined,
        actionContext: ctx?.actionContext ?? undefined,
      }
    }
    // Fallback: the engine may be waiting on a non-InteractionNode pending
    // choice (OrNode / XorNode / OptionalNode emit `step.type === 'choice'`
    // directly without wrapping in an InteractionNode). The engine caches
    // the most recent emitted choice on `lastEmittedChoice`; surface it as
    // the legacy `{ type: 'choice' }` PendingAction.
    const composite = frame.engine.peekPendingChoiceFromComposite()
    if (composite) {
      return {
        type: 'choice',
        playerIndex,
        spaceId,
        options: composite.options,
        promptKey: composite.promptKey,
        promptParams: composite.promptParams,
        costOverride: frame.engine.getLastComputedCosts(),
        sourceCard: ctx?.sourceCard ?? undefined,
        actionContext: ctx?.actionContext ?? undefined,
      }
    }
    return { type: 'none' }
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
      // Task 10/11: `this.pending` field is gone; derive the snapshot from
      // `engineStack.peekInteraction()`. The HistoryEntry.pending field
      // remains live — `undoStep()` reads `entry.pending.type === 'choice'`
      // to recognise prior-choice farm-prompt restore points (see
      // `canRestorePriorChoice` branch). Do NOT remove this field without
      // migrating that read site.
      pending: this.clonePending(this.getCurrentPending()),
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
    // Task 10/11: `this.pending` field deleted from `GameState`. The
    // `entry.pending` snapshot persists on HistoryEntry for `undoStep()`'s
    // `canRestorePriorChoice` discriminator (read-only here). Live pending
    // shape is rederived from `engineStack.peekInteraction()` after the
    // stack is restored below.
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
      const engine = this.createEngineFromSource(source)
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
    resourceKeyList.forEach((key) => {
      const delta = player.resources[key] - before.resources[key]
      if (delta > 0) gains[key] = delta
      if (delta < 0) costs[key] = Math.abs(delta)
    })
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

  private logActionDetail(before: PlayerState, player: PlayerState) {
    if (!this.activeSpaceId) return
    const space = this.getSpaceById(this.activeSpaceId)
    if (!space) return
    const detailParts = this.buildActionDetailParts(before, player)
    const hasGains = resourceKeyList.some((key) => (detailParts.gains[key] ?? 0) > 0)
    const hasCosts = resourceKeyList.some((key) => (detailParts.costs[key] ?? 0) > 0)
    const hasEffects = Object.keys(detailParts.effects ?? {}).length > 0
    if (
      detailParts.effects?.improvements
      || detailParts.effects?.minorImprovements
      || detailParts.effects?.bakeBread
    ) return
    if (!hasGains && !hasCosts && !hasEffects) return
    this.state.log.unshift({
      key: 'log.actionDetail',
      params: {
        player: player.name,
        action: space.nameKey,
        detailParts,
      },
    })
  }

  /**
   * Mid-flow flush: when a leaf ActionNode inside a SEQ/optional flow finishes,
   * emit a partial `log.actionDetail` for that sub-action and advance the
   * baseline snapshot. Subsequent leaves and the final aggregate then only see
   * the residual delta, avoiding duplicate logs.
   *
   * Skipped when:
   *   - no active snapshot (no in-flight action),
   *   - leaf actionId equals the top-level activeSpaceId (the wrapper itself),
   *   - the action wrote its own logKey (e.g. `log.sow`, `log.buildStable`),
   *   - the resulting delta is already covered by a dedicated immediate log
   *     (for example improvement / bake-bread).
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
    for (const key of resourceKeyList) {
      const cardGain = this.cardEffectDeltasSinceFlush.gains[key] ?? 0
      const cardCost = this.cardEffectDeltasSinceFlush.costs[key] ?? 0
      if (cardGain > 0) {
        detailParts.gains[key] = Math.max(0, (detailParts.gains[key] ?? 0) - cardGain)
      }
      if (cardCost > 0) {
        detailParts.costs[key] = Math.max(0, (detailParts.costs[key] ?? 0) - cardCost)
      }
    }
    this.cardEffectDeltasSinceFlush = { gains: {}, costs: {} }
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
    const labelKey = def.nameKey ?? `actions.${actionId}.name`
    this.state.log.unshift({
      key: 'log.actionDetail',
      params: {
        player: player.name,
        action: labelKey,
        detailParts,
      },
    })
    player._activeActionBonusSources = []
    this.actionStartPlayerSnapshot = this.clonePlayer(player)
  }

  private flushEngineLog() {
    const entries = this.engineLog.all()
    if (entries.length > 0) {
      const toAdd = entries.filter((e) => e.key !== 'log.action')
      for (const entry of toAdd) {
        if (entry.key === 'log.cardEffectGain') {
          const gain = (entry.params as { gain?: Partial<Resource> } | undefined)?.gain
          if (gain) this.accumulateCardEffectDelta('gains', gain)
        } else if (entry.key === 'log.cardEffectPay') {
          const cost = (entry.params as { cost?: Partial<Resource> } | undefined)?.cost
          if (cost) this.accumulateCardEffectDelta('costs', cost)
        }
      }
      for (let i = toAdd.length - 1; i >= 0; i--) {
        this.state.log.unshift(toAdd[i])
      }
      this.engineLog.clear()
    }
  }

  private accumulateCardEffectDelta(
    bucket: 'gains' | 'costs',
    delta: Partial<Resource>,
  ) {
    const target = this.cardEffectDeltasSinceFlush[bucket]
    for (const [key, value] of Object.entries(delta)) {
      if (typeof value !== 'number' || value <= 0) continue
      const k = key as keyof Resource
      target[k] = (target[k] ?? 0) + value
    }
  }

  private finalizeActionLog(player: PlayerState) {
    const before = this.actionStartPlayerSnapshot
    if (before) {
      this.logActionDetail(before, player)
    }
    this.actionStartPlayerSnapshot = null
    delete player._activeActionBonusSources
  }

  private startStageFlow(
    flow: ActionFlow,
    hook: StageResumeState['hook'],
    playerIndex: number,
    nextCardIndex: number,
  ) {
    this.engineStack.push({
      engine: this.createFlowEngine(flow),
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

  private finishCompletedActionTurn(playerIndex: number): SessionResponse {
    const player = this.state.players[playerIndex]
    if (!player) return this.respond(false, 'invalid player')
    this.finalizeActionLog(player)
    this.turnOwnerPlayerIndex = null
    this.engineStack.clear()
    const allWorkersUsed = this.state.players.every((p) => workersAvailable(this.state, p) <= 0)
    if (!allWorkersUsed) {
      const next = this.nextPlayerIdx(this.state.players, this.state.currentPlayerIndex)
      this.startConfirmNextPlayer(next)
    } else {
      const startIdx = this.state.players.findIndex((p) => p.startPlayer)
      this.startConfirmNextPlayer(startIdx === -1 ? 0 : startIdx)
    }
    return this.respond()
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
      this.state.log.unshift({ key: 'log.harvestPhaseReap' })
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
    this.state.harvestReapSummary = {}
    const harvestOrder = this.getHarvestPlayerIndices()
    harvestOrder.forEach((index) => {
      const player = this.state.players[index]
      if (!player) return
      // E58 LunchtimeBeer (and any future card) may flag a player to skip
      // the field phase of the current harvest. Flagged players are not reaped.
      if (this.hasPassFieldAndBreed(player)) return
      const result = reap(this.state, player)
      this.state.harvestReapSummary![player.id] = result.reapSummary
      incHarvestedGrain(player, result.reapSummary.resources.grain ?? 0)
      incHarvestedVegetable(player, result.reapSummary.resources.vegetable ?? 0)
      this.logHarvestResourceEntry('log.harvestReapDetail', player, result.reapSummary.resources)
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
    if (this.continueStageHook('onStartHarvestFeedingPhase')) {
      return this.respond()
    }
    return this.continueHarvestFeeding()
  }

  private continueHarvestFeeding(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (playerIndex === 0 && cardIndex === 0) {
      this.state.log.unshift({ key: 'log.harvestPhaseFeed' })
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
    applyRoundGrowth(this.state)
    applyFutureMeeples(this.state)
    if (this.continueStageHook('onRoundStart')) {
      return this.respond()
    }
    const startIdx = this.state.players.findIndex((player) => player.startPlayer)
    this.state.currentPlayerIndex = startIdx === -1 ? 0 : startIdx
    if (this.state.round >= 2 && startIdx >= 0) {
      incFirstPlayer(this.state.players[startIdx]!)
    }
    this.state.roundPhase = 'work'
    this.state.log.unshift({ key: 'log.enterRound', params: { round: this.state.round } })
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
    // Fall-through: delegate to the legacy stage flow resolver for hooks
    // that have not (yet) been migrated to the sub-flow umbrella model.
    this.resumeStageFlow(stageResume)
  }

  private runEngineSteps(): void {
    let frame = this.engineStack.current()
    if (!frame || frame.ownerPlayerIndex === null || !frame.spaceId) return
    let player = this.state.players[frame.ownerPlayerIndex]
    let space = this.getSpaceById(frame.spaceId)
    if (!player || !space) return

    while (true) {
      const before = this.clonePlayer(player)
      const step = frame.engine.proceed({ state: this.state, player, space })
      this.flushEngineLog()

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
        if (isActionEngine && this.runPlaceFarmerAfterHooks(player, space)) {
          // The frame's engine/source were replaced in-place; loop again with
          // the same frame.
          frame = this.engineStack.current()!
          continue
        }
        if (this.hasPendingAnimals(player)) {
          const originIdx = this.turnOwnerPlayerIndex ?? ownerIdx
          this.engineStack.pop()
          this.startReorganizeSubFlow(ownerIdx, 'anytime', { originPlayerIndex: originIdx })
          return
        }
        if (this.turnOwnerPlayerIndex !== null) {
          const ownerIndexLocal = this.turnOwnerPlayerIndex
          this.finalizeActionLog(player)
          this.engineStack.pop()
          this.continueEndTurnHooks(ownerIndexLocal)
          return
        }
        this.finalizeActionLog(player)
        this.engineStack.pop()
        return
      }

      if (step.type === 'playerSwitch') {
        const toIndex = this.state.players.findIndex((p) => p.id === step.targetPlayerId)
        if (toIndex !== -1 && toIndex !== frame.ownerPlayerIndex) {
          this.pushHistory(false, true)
          const fromIndex = frame.ownerPlayerIndex
          frame.ownerPlayerIndex = toIndex
          player = this.state.players[toIndex]!
          space = this.getSpaceById(frame.spaceId) ?? space
          frame.deferredPlayerSwitch = { fromPlayerIndex: fromIndex, toPlayerIndex: toIndex }
        }
        continue
      }

      if (step.type === 'choice') {
        // breed action (e.g. harvest reap or B104 last-harvest enforcement)
        // emits ActionExecutionResult { type: 'request', request: { kind:
        // 'animal-reorg' } } — the engine wraps it in the new 'request'
        // branch and surfaces it as step.type === 'choice', losing the
        // direct kind discriminator. Detect it via the InteractionNode's
        // request field and pivot to the same anytime sub-flow path the
        // legacy 'animalReorg' result took. After Task 6 we leave the parent
        // frame on the stack and push a reorganize sub-flow frame.
        const interaction = this.engineStack.peekInteraction()
        const isReorgSubFlow =
          frame.source.kind === 'flow'
          && (frame.source.flow as { actionId?: string }).actionId === 'reorganize'
        if (
          interaction?.request?.kind === 'animal-reorg'
          && !isReorgSubFlow
        ) {
          const pIdx = frame.ownerPlayerIndex
          this.startReorganizeSubFlow(pIdx, 'anytime')
          return
        }
        // Synthetic interaction-only frames (the `__interaction_only__`
        // leaf-flow frames pushed by start* triggers — confirm-next-player /
        // confirm-player-switch / feed / dev-fence-select) must NOT enter
        // the auto-resolve path below. Their engine has no registered
        // handler for `__interaction_only__`, so `resolveChoice` would
        // silently no-op without resolving the InteractionNode and the
        // next `proceed()` would surface the same step again — an infinite
        // loop. The InteractionNode itself is the source of truth (Task 10);
        // yield to the client and wait for the matching resolveChoice
        // command. Predicate `isSyntheticInteractionFrame` (S-2) replaces
        // the legacy hard-coded kind list so future synthetic frames
        // (Task 11+) inherit the right behaviour automatically.
        if (isSyntheticInteractionFrame(frame)) {
          return
        }
        // Lazy confirmation: if we silently switched players and now hit a choice,
        // show confirmPlayerSwitch first. The InteractionNode stays unresolved in the engine.
        if (frame.deferredPlayerSwitch) {
          const { fromPlayerIndex, toPlayerIndex } = frame.deferredPlayerSwitch
          frame.deferredPlayerSwitch = null
          this.startConfirmPlayerSwitch(fromPlayerIndex, toPlayerIndex)
          return
        }
        if (step.choice.options.length === 1) {
          let autoOptions = step.choice.options
          while (autoOptions.length === 1) {
            const auto = autoOptions[0]
            const resolvedActionId = frame.engine.snapshot().pendingInteractionActionId ?? undefined
            const result = frame.engine.resolveChoice(auto.value, { state: this.state, player, space })
            this.flushEngineLog()
            if (result.type === 'ok' && resolvedActionId) {
              this.flushLeafActionDetail(resolvedActionId, Boolean(result.logKey))
            }
            if (result.type === 'request' && result.request.kind === 'choice') {
              const requestOptions = result.request.options
              if (requestOptions.length === 1) {
                autoOptions = requestOptions
                continue
              }
              // The follow-up InteractionNode now lives on the engine's tree
              // (applyInteractionRequest -> setChoice with promptParams). The
              // legacy `this.pending = { ... }` mirror is gone (Task 10): every
              // consumer reads the live InteractionNode via
              // `engineStack.peekInteraction()`.
              return
            }
            if (result.type === 'fail') {
              this.engineStack.pop()
              this.actionStartIndex = null
              return
            }
            if (this.getAnimalCount(player) > this.getAnimalCount(before)) {
              const pIdx = frame.ownerPlayerIndex
              // Match legacy behaviour: this is a fall-through reorganize
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
        // The InteractionNode that produced this `step.type === 'choice'`
        // is the canonical source of the pending interaction (Task 10).
        // Yield to the client; `buildInteraction()` derives the response
        // shape from `engineStack.peekInteraction()`.
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

      if (step.type === 'ok' && step.result.type === 'ok') {
        this.flushLeafActionDetail(step.actionId, Boolean(step.result.logKey))
      }

      // NOTE: the legacy `step.result.type === 'animalReorg'` block lived
      // here, used to handle `breed` returning that variant explicitly when
      // animal count did not change (B104 last-harvest enforcement). Since
      // Task 5 migrated breed to emit `'request' + kind: 'animal-reorg'`,
      // the engine now wraps it in step.type === 'choice' (handled in the
      // dedicated reorg branch in the `step.type === 'choice'` block above
      // via `peekInteraction()?.request.kind === 'animal-reorg'`). The
      // generic `getAnimalCount > before` check below still picks up the
      // animals-bred path where breed returns `'ok'` so engine after-hooks
      // (D60 LargePottery, B104 SheepWalker, ...) keep firing on the
      // post-mutate state.

      if (this.getAnimalCount(player) > this.getAnimalCount(before)) {
        const pIdx = frame.ownerPlayerIndex
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
    const ctx: import('../cards/card-listeners.ts').CardListenerContext = {
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

  private isActionSpaceAvailableToPlayer(player: PlayerState, space: ActionSpace, roundOpen: Map<string, number>): boolean {
    const openRound = roundOpen.get(space.id) ?? space.roundAvailable
    if (this.state.round < openRound) return false
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
    const roundOpen = createRoundOpenById(this.state.roundActionOrder)
    return this.state.actionSpaces
      .filter((space) => this.isActionSpaceAvailableToPlayer(player, space, roundOpen))
      .map((space) => ({ spaceId: space.id, nameKey: space.nameKey }))
  }

  /**
   * Compute which action spaces can be executed by the current player.
   * Returns a map of spaceId -> isExecutable for all action spaces.
   */
  getActionAvailability(playerIndex: number): Record<string, boolean> {
    const player = this.state.players[playerIndex]
    if (!player) return {}

    const roundOpen = createRoundOpenById(this.state.roundActionOrder)
    const result: Record<string, boolean> = {}

    for (const space of this.state.actionSpaces) {
      result[space.id] = this.isActionSpaceAvailableToPlayer(player, space, roundOpen)
    }

    // Also mark occupied spaces that computeArgs listeners expose as extra options
    if (workersAvailable(this.state, player) > 0) {
      const listenerContext: import('../cards/card-listeners.ts').CardListenerContext = {
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
      result[`minor:${improvementId}`] =
        (canUseMinorImprovement &&
          isMinorImprovementPlayable(
            this.state,
            player,
            improvementId,
            'minor-improvement',
          )) ||
        (canUseImprovementAny &&
          isMinorImprovementPlayable(
            this.state,
            player,
            improvementId,
            'improvement-any',
          ))
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
    this.state.players.forEach((player) => {
      const zones = computeAnimalZones(player)
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

  private resolvePendingChoice(
    playerIndex: number,
    value: string,
    pushHistoryEntry: boolean,
    payload?: Record<string, unknown>,
  ): SessionResponse {
    const node = this.engineStack.peekInteraction()
    const frame = this.engineStack.current()
    const composite = frame?.engine.peekPendingChoiceFromComposite() ?? null
    const pendingPlayerIndex = frame?.ownerPlayerIndex ?? -1
    const pendingPromptKey = node?.promptKey ?? composite?.promptKey
    const pendingOptions = node?.choices ?? composite?.options ?? []
    const pendingActionContext = frame?.engine.getPendingInteractionContext()?.actionContext
    const pendingSourceCard = frame?.engine.getPendingInteractionContext()?.sourceCard
    // 'choice' (typed), 'animal-reorg' (legacy commit pathway), and any
    // ChoiceNode-emitted untyped request all flow through the engine's
    // resolveChoice path. Composite-node (OrNode/XorNode/OptionalNode)
    // emissions are also accepted: those don't carry an InteractionNode but
    // the engine has a pending choice on the composite node itself.
    // 'feed' / 'confirm-next-player' / 'confirm-player-switch' are
    // dispatched by the public `resolveChoice` to dedicated handlers and
    // never reach this method.
    const isInteractionNodeTarget =
      node &&
      (!node.request ||
        node.request.kind === 'choice' ||
        node.request.kind === 'animal-reorg' ||
        node.request.kind === 'farm-select' ||
        node.request.kind === 'selection')
    const isResolveChoiceTarget = Boolean(isInteractionNodeTarget || composite)
    if (!isResolveChoiceTarget || pendingPlayerIndex !== playerIndex) {
      return this.respond(false, 'no pending choice for this player')
    }
    // Reject attempts to resolve a choice with an option that's been marked disabled
    // (e.g. B3 Moonshine's "play" option when the player can't afford 2 food).
    const chosenOption = pendingOptions.find((o) => o.value === value)
    if (chosenOption?.disabled) {
      return this.respond(false, 'option disabled')
    }
    if (!this.engine) {
      if (pendingPromptKey === 'ui.interactionFenceSelect' && value === 'cancel') {
        // Engine already absent; nothing to clear (Task 10 deleted `this.pending`).
        return this.respond()
      }
      return this.respond(false, 'no active engine')
    }
    const player = this.state.players[playerIndex]
    const space = this.getSpaceById(this.activeSpaceId)
    if (!player || !space) return this.respond(false, 'invalid state')

    if (pushHistoryEntry) {
      this.pushHistory()
    }
    // Card-effect resolveChoice hook: if the pending choice has a sourceCard with a
    // registered CardEffect.resolveChoice, give the card a chance to produce a follow-up
    // ActionFlow that runs after the engine's own choice resolution.
    if (pendingSourceCard) {
      const cardEffect = getCardEffect(pendingSourceCard)
      if (cardEffect?.resolveChoice) {
        const cardFlow = cardEffect.resolveChoice(this.state, player, value, {
          sourceCard: pendingSourceCard,
          actionContext: pendingActionContext,
        })
        if (cardFlow && this.engine) {
          // Insert the follow-up so it runs after the engine finishes resolving the choice.
          // Mirrors the `{ type: 'flow' }` branch of the engine's own resolveChoice.
          this.engine.insertFlowAfterPendingChoice(cardFlow)
        }
      }
    }
    const resolvedActionId = this.engine.snapshot().pendingInteractionActionId ?? undefined
    const result = this.engine.resolveChoice(value, { state: this.state, player, space }, payload)
    this.flushEngineLog()
    if (result.type === 'ok' && resolvedActionId) {
      this.flushLeafActionDetail(resolvedActionId, Boolean(result.logKey))
    }
    if (result.type === 'request' && result.request.kind === 'choice') {
      // The engine's `applyInteractionRequest` already wired the follow-up
      // InteractionNode (with promptKey + promptParams + options) onto the
      // tree; no `this.pending` mirror is needed (Task 10).
      return this.respond()
    }
    if (result.type === 'fail') {
      this.engineStack.pop()
      this.actionStartIndex = null
      this.actionStartPlayerSnapshot = null
      delete player._activeActionBonusSources
      this.turnOwnerPlayerIndex = null
      return this.respond(false, result.logKey ?? 'action failed')
    }
    this.runEngineSteps()
    return this.respond()
  }

  /**
   * Unified entry-point for resolving any InteractionNode hosted on the
   * engineStack. Dispatches on the top-of-stack InteractionRequest's `kind`
   * discriminator so the legacy `confirmNextPlayer` / `confirmPlayerSwitch` /
   * `confirmHarvestFeed` / `commitAnimalReorg` paths collapse into one
   * client-facing call. Falls back to the legacy `state.pending`-driven
   * `resolvePendingChoice` for plain `choice` interactions (still the path
   * for ChoiceNode emissions that haven't been promoted to typed requests).
   */
  resolveChoice(
    playerIndex: number,
    value: string,
    payload?: Record<string, unknown>,
  ): SessionResponse {
    const node = this.engineStack.peekInteraction()
    const request = node?.request
    if (request) {
      // Reviewer C-1: validate `value` against the InteractionNode's known
      // choices before dispatching. Pre-S1, `resolvePendingChoice` rejected
      // any call whose top-of-stack pending wasn't a plain `choice`; the
      // S1 dispatch widens the entry-point to also handle confirm/feed kinds,
      // but a stray client value must still be rejected (otherwise an
      // unrelated submission like `resolveChoice('sow')` against a
      // `confirm-next-player` frame silently advances the turn).
      const isValidValue = node!.choices.some((opt) => opt.value === value)
      switch (request.kind) {
        case 'confirm-next-player':
          if (!isValidValue) return this.respond(false, 'invalid choice value')
          return this.handleConfirmNextPlayerResolved(request.nextPlayerIndex)
        case 'confirm-player-switch':
          if (!isValidValue) return this.respond(false, 'invalid choice value')
          return this.handleConfirmPlayerSwitchResolved(request.toPlayerIndex)
        case 'feed': {
          if (!isValidValue) return this.respond(false, 'invalid choice value')
          const sels = (payload as { selections?: FeedSelections } | undefined)?.selections
            ?? (Array.isArray(payload) ? (payload as unknown as FeedSelections) : [])
          return this.handleFeedResolved(playerIndex, sels)
        }
        case 'animal-reorg':
        case 'choice':
          // animal-reorg today still flows through the legacy commit pathway;
          // plain choice (ChoiceNode-emitted requests not yet typed) follows
          // the existing options-driven pending model. `resolvePendingChoice`
          // already validates `value` against pendingOptions/composite cache.
          return this.resolvePendingChoice(playerIndex, value, true, payload)
        case 'farm-select':
        case 'selection':
        case 'card-draft':
          // S2 Task 2 introduced the farm-select / selection / card-draft kinds
          // ahead of their resolvers (Tasks 5/6/7/12). Until those tasks wire
          // dedicated handlers, fall back to the legacy pending-options path so
          // tests/UX continue working through ChoiceNode.choices validation.
          return this.resolvePendingChoice(playerIndex, value, true, payload)
        default: {
          const _exhaustive: never = request
          return this.respond(false, `unhandled interaction kind: ${JSON.stringify(_exhaustive)}`)
        }
      }
    }
    return this.resolvePendingChoice(playerIndex, value, true, payload)
  }

  startDevFenceSelect(playerIndex: number): SessionResponse {
    if (this.state.gameOver) return this.respond(false, 'game is over')
    if (playerIndex !== this.state.currentPlayerIndex) return this.respond(false, 'not your turn')
    const player = this.state.players[playerIndex]
    if (!player) return this.respond(false, 'invalid player')
    if (this.engineStack.peekInteraction()) return this.respond(false, 'pending action exists')
    // Push a synthetic interaction-only frame so `buildInteraction()` surfaces
    // the dev fence-select prompt via the same engineStack-driven path as
    // every other choice (Task 10).
    const node = new InteractionNode(
      this.nextSyntheticNodeId('interaction:dev-fence-select'),
      [
        { value: 'confirm', labelKey: 'ui.interactionFenceConfirm' },
        { value: 'cancel', labelKey: 'ui.interactionFenceCancel' },
      ],
      { kind: 'choice', options: [
        { value: 'confirm', labelKey: 'ui.interactionFenceConfirm' },
        { value: 'cancel', labelKey: 'ui.interactionFenceCancel' },
      ] },
    )
    node.promptKey = 'ui.interactionFenceSelect'
    const flow: ActionFlow = { type: 'leaf', actionId: INTERACTION_ONLY_ACTION_ID }
    const engine = this.createFlowEngine(flow)
    engine.injectInteraction(node)
    this.engineStack.push({
      engine,
      source: { kind: 'flow', flow },
      ownerPlayerIndex: playerIndex,
      spaceId: 'dev-create-pasture',
      stageResume: null,
      deferredPlayerSwitch: null,
      reason: 'top-level',
    })
    return this.respond()
  }

  /**
   * @deprecated Prefer `resolveChoice(playerIndex, 'confirm', { selections })`.
   * Retained as a thin alias because 24 session-test files still call this
   * method by name; replacement is a mechanical sed-codemod queued for a
   * follow-up sprint per `docs/sprint-S2-progress.md` §3.4.
   */
  confirmHarvestFeed(
    playerIndex: number,
    selections: FeedSelections,
  ): SessionResponse {
    const node = this.engineStack.peekInteraction()
    const frame = this.engineStack.current()
    if (
      node?.request?.kind !== 'feed' ||
      frame?.ownerPlayerIndex !== playerIndex
    ) {
      return this.respond(false, 'no pending feed')
    }
    return this.handleFeedResolved(playerIndex, selections)
  }

  private handleFeedResolved(
    playerIndex: number,
    selections: FeedSelections,
  ): SessionResponse {
    // Task 10 / I-1: the synthetic feed InteractionNode on the engine stack
    // is now the source of truth (no more `this.pending` mirror). Read the
    // request payload (`remaining`, `foodUsed`, `feedQueue`) directly off it.
    const node = this.engineStack.peekInteraction()
    const frame = this.engineStack.current()
    if (
      node?.request?.kind !== 'feed' ||
      frame?.ownerPlayerIndex !== playerIndex
    ) {
      return this.respond(false, 'no pending feed')
    }
    const feedRequest = node.request
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
    ): import('../cards/types').CardExchange | undefined => {
      if (sourceId === BASIC_CONVERSION_SOURCE_ID) {
        return getBasicConversionExchange(idx)
      }
      let card:
        | { exchanges?: readonly import('../cards/types').CardExchange[] }
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
      _exchange?: import('../cards/types').CardExchange
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
        this.state.log.unshift({
          key: 'log.harvestFeedConvert',
          params: {
            player: player.name,
            source: sel.sourceName ?? 'Harvest conversion',
            cost: costMap,
            food: gainMap,
          },
        })
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

  /**
   * @deprecated Prefer `resolveChoice(toPlayerIndex, 'confirm')` after
   * reading `toPlayerIndex` off `interaction.request.toPlayerIndex` (or the
   * legacy `pending.toPlayerIndex`). Retained as a thin alias because 35
   * session-test files still call this method by name; replacement is a
   * mechanical sed-codemod queued for a follow-up sprint per
   * `docs/sprint-S2-progress.md` §3.4.
   */
  confirmPlayerSwitch(): SessionResponse {
    const node = this.engineStack.peekInteraction()
    if (node?.request?.kind !== 'confirm-player-switch') {
      return this.respond(false, 'no pending player switch')
    }
    return this.handleConfirmPlayerSwitchResolved(node.request.toPlayerIndex)
  }

  /** S2 Task 10 part 3: thin delegator — body lives in `phases/round.ts`. */
  private handleConfirmPlayerSwitchResolved(toPlayerIndex: number): SessionResponse {
    return roundPhase.handleConfirmPlayerSwitchResolved(this, toPlayerIndex)
  }

  /**
   * @deprecated Prefer `resolveChoice(nextPlayerIndex, 'confirm')` after
   * reading `nextPlayerIndex` off `interaction.request.nextPlayerIndex` (or
   * the legacy `pending.nextPlayerIndex`). Retained as a thin alias because
   * 17 session-test files still call this method by name; replacement is a
   * mechanical sed-codemod queued for a follow-up sprint per
   * `docs/sprint-S2-progress.md` §3.4.
   */
  confirmNextPlayer(): SessionResponse {
    const node = this.engineStack.peekInteraction()
    if (node?.request?.kind !== 'confirm-next-player') {
      return this.respond(false, 'no pending transition')
    }
    return this.handleConfirmNextPlayerResolved(node.request.nextPlayerIndex)
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

  performRoundEnd(): SessionResponse {
    const allUsed = this.state.players.every((p) => workersAvailable(this.state, p) <= 0)
    if (!allUsed) return this.respond(false, 'not all workers used')
    if (this.engineStack.peekInteraction()) return this.respond(false, 'pending action exists')

    const pendingAnimal = this.state.players.findIndex((p) => this.hasPendingAnimals(p))
    if (pendingAnimal !== -1) {
      this.startReorganizeSubFlow(pendingAnimal, 'round-end',
        { originPlayerIndex: this.turnOwnerPlayerIndex })
      return this.respond()
    }

    this.pushHistory()
    this.state.roundPhase = 'returning-home'
    return this.continueBeforeReturnHomeHooks()
  }

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
    this.state.log.unshift({ key: 'log.harvestPhaseBreed' })
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
      children.push({ type: 'playerSwitch', targetPlayerId: p.id })
      children.push(breedLeaf('harvest'))
    }
    if (children.length === 1) {
      return children[0]
    }
    return { type: 'seq', children }
  }

  private finalizeRound(): SessionResponse {
    this.state.roundPhase = 'preparation'
    this.state.players.forEach((p) => runRoundEndHooks(this.state, p))
    return this.continueAfterRoundEnd()
  }

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
      this.state.log.unshift({ key: 'log.gameOver' })
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
      { state: this.state, player: updatedPlayer, space },
    )
    this.flushEngineLog()

    if (result.type === 'request' && result.request.kind === 'choice') {
      // Engine wired the new InteractionNode (with promptKey + promptParams);
      // no `this.pending` mirror needed (Task 10).
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

  commitSelectionChoice(
    playerIndex: number,
    payload: { positions?: FarmTilePosition[]; cardIds?: string[] },
  ): SessionResponse {
    const node = this.engineStack.peekInteraction()
    const frame = this.engineStack.current()
    const isPlainChoice = node && (!node.request || node.request.kind === 'choice')
    if (!isPlainChoice || frame?.ownerPlayerIndex !== playerIndex) {
      return this.respond(false, 'no pending selection choice for this player')
    }
    const player = this.state.players[playerIndex]
    if (!player) return this.respond(false, 'invalid player')

    const interactionContext = frame.engine.getPendingInteractionContext()?.actionContext
    const selectionKind = (interactionContext?.selectionKind as string | undefined) ?? 'farm-position'
    const maxSelections = (interactionContext?.maxSelections as number) ?? 1

    // occupation-hand: validate card IDs
    if (selectionKind === 'occupation-hand') {
      const cardIds = payload.cardIds ?? []
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
      // and falls back to splitting the legacy `cardIds.join(',')` choice
      // string only when payload is absent.
      const choiceValue = cardIds.length > 0 ? 'confirm' : 'cancel'
      const space = this.getSpaceById(this.activeSpaceId!) ?? this.createSyntheticSpace('selection')
      this.engine?.resolveChoice(choiceValue, {
        state: this.state,
        player: this.state.players[playerIndex]!,
        space,
      }, { cards: cardIds })
      this.flushEngineLog()
      this.runEngineSteps()
      return this.continueAfterResolvedFarmChoice(playerIndex)
    }

    // farm-position (default)
    const positions = payload.positions ?? []
    if (positions.length > maxSelections) {
      return this.respond(false, 'too many selection positions')
    }
    for (const pos of positions) {
      const exists = player.fields.some((f) => f.row === pos.row && f.col === pos.col)
      if (!exists) return this.respond(false, 'invalid field position')
    }

    this.pushHistory()
    const positionStrings = positions.map((p) => `${p.row}-${p.col}`)
    const choiceValue = positions.length > 0 ? 'confirm' : 'cancel'
    const space = this.getSpaceById(this.activeSpaceId!) ?? this.createSyntheticSpace('selection')
    this.engine?.resolveChoice(choiceValue, {
      state: this.state,
      player: this.state.players[playerIndex]!,
      space,
    }, { positions: positionStrings })
    this.flushEngineLog()
    this.runEngineSteps()
    return this.continueAfterResolvedFarmChoice(playerIndex)
  }

  devSetResources(playerIndex: number, resources: Record<string, number>): SessionResponse {
    const player = this.state.players[playerIndex]
    if (!player) return this.respond(false, 'player not found')
    Object.entries(resources).forEach(([key, value]) => {
      if (typeof value === 'number') {
        (player.resources as Record<string, number>)[key] = value
      }
    })
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
    // Remove from all players' hands first
    for (const p of this.state.players) {
      p.minorHand = p.minorHand.filter(id => id !== cardId)
      p.occupationHand = p.occupationHand.filter(id => id !== cardId)
    }
    if (this.isOccupationCard(cardId)) {
      player.occupationHand.push(cardId)
    } else {
      player.minorHand.push(cardId)
    }
    return this.respond()
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
    const interactionNode = this.engineStack.peekInteraction()
    const interactionFrame = this.engineStack.current()
    // S2 Task 5/6 — farm-select kind also flows through the
    // farm-prompt undo special-cancel path (it carries the same
    // promptKey shape as the legacy 'choice' farm-prompts).
    const isPlainChoiceOrFarmSelect =
      interactionNode &&
      (!interactionNode.request ||
        interactionNode.request.kind === 'choice' ||
        interactionNode.request.kind === 'farm-select')
    const farmPrompt = isPlainChoiceOrFarmSelect ? this.isFarmPromptKey(interactionNode.promptKey) : null
    if (isPlainChoiceOrFarmSelect && farmPrompt && interactionFrame) {
      const currentPromptKey = interactionNode.promptKey
      const currentSpaceId = interactionFrame.spaceId
      const currentPlayerIndex = interactionFrame.ownerPlayerIndex
      const entry = this.history[this.history.length - 1]
      const canRestorePriorChoice =
        !!entry &&
        entry.undoBoundary !== true &&
        entry.activeSpaceId === this.activeSpaceId &&
        entry.activePlayerIndex === this.activePlayerIndex &&
        entry.pending.type === 'choice'
      if (canRestorePriorChoice) {
        this.history.pop()
        this.restoreHistory(entry)
        this.recomputeActionStartIndex()
        return this.respond()
      }
      if (entry && this.engine?.hasPendingChoiceCompositeAncestor()) {
        this.history.pop()
        this.restoreHistory(entry)
        this.recomputeActionStartIndex()
        return this.respond()
      }
      const cancelResult = this.resolvePendingChoice(currentPlayerIndex, 'cancel', false)
      const stillOnSameFarmPrompt =
        cancelResult.ok &&
        cancelResult.pending.type === 'choice' &&
        cancelResult.pending.promptKey === currentPromptKey &&
        cancelResult.pending.spaceId === currentSpaceId &&
        cancelResult.interaction.stateId === 'wait' &&
        cancelResult.interaction.farm !== undefined
      if (!stillOnSameFarmPrompt) {
        return cancelResult
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
    const entry = this.history.pop()
    if (!entry) return this.respond(false, 'no history to undo')
    this.restoreHistory(entry)
    this.recomputeActionStartIndex()
    return this.respond()
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
    this.restoreHistory(entry)
    this.history = this.history.slice(0, targetIndex)
    if (targetIndex === this.actionStartIndex) {
      this.actionStartIndex = null
    } else {
      this.recomputeActionStartIndex()
    }
    return this.respond()
  }
}
