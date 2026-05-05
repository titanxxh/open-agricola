/**
 * Round-phase mixin extracted from GameCore (S2 Task 10).
 *
 * Hosts the side-effect-heavy paths (`takeAction`, confirm-* triggers,
 * round transitions, returningHome / roundEnd continuations) plus the
 * pure seat-walk helpers (`nextSeatedPlayerIdx`, `computeStartPlayerIdx`).
 *
 * Cross-module GameCore state access goes through the `@internal`
 * accessor methods on GameCore (e.g. `pushEngineFrame`, `setTurnOwner`,
 * `appendHistory`); see the accessor block in `session-core.ts` for the
 * full inventory.
 */

import type { GameState, PlayerState } from '../../game/types.ts'
import { smallestAvailableWorker, workersAvailable } from '../../game/player.ts'
import { addWorkerRef, isSpaceOccupied } from '../../game/space.ts'
import { computeAllowedPlacementSpaces } from '../../actions/helpers/placement-availability.ts'
import { incPlacedFarmers } from '../../logic/stats.ts'
import { recordActionSnapshot } from '../../cards/helpers/action-snapshot.ts'
import { recordRoundPlacement } from '../../cards/helpers/round-placement.ts'
import { executeCardListener, getMatchingListeners } from '../../cards/card-listeners.ts'
import { shouldSkipPlayerTurn } from '../../cards/card-effects.ts'
import type { GameCore, SessionResponse } from '../session-core.ts'
import { InteractionNode, type EngineNode } from '../../engine/index.ts'
import type { FeedQueueEntry } from '../../game/types.ts'

/**
 * Find the next seated player (in turn order) who still has at least one
 * worker available. Returns the current index if no other player has a
 * free worker (caller treats this as "stay on the same seat").
 */
export const nextSeatedPlayerIdx = (
  state: GameState,
  players: PlayerState[],
  current: number,
): number => {
  for (let off = 1; off <= players.length; off++) {
    const idx = (current + off) % players.length
    const candidate = players[idx]
    if (candidate && workersAvailable(state, candidate) > 0) return idx
  }
  return current
}

/**
 * Resolve the starting-player seat index. Returns 0 when no player owns
 * the start-player marker (matches the legacy GameCore.getStartPlayerIdx
 * fallback).
 */
export const computeStartPlayerIdx = (state: GameState): number => {
  const startIdx = state.players.findIndex((player) => player.startPlayer)
  return startIdx === -1 ? 0 : startIdx
}

/**
 * Top-level player action entry. Migrated from `GameCore.takeAction`
 * (S2 Task 10): the per-method body lives here, while GameCore retains
 * a thin delegator. Cross-module GameCore state mutations go through
 * the named accessors on `core.*`.
 */
export const takeAction = (
  core: GameCore,
  playerIndex: number,
  spaceId: string,
): SessionResponse => {
  const state = core.state
  if (state.gameOver) return core.emitResponse(false, 'game is over')
  if (state.phase === 'draft') return core.emitResponse(false, 'draft in progress')
  if (core.peekEngineInteraction()) return core.emitResponse(false, 'interaction in progress')
  if (playerIndex !== state.currentPlayerIndex) return core.emitResponse(false, 'not your turn')
  const player = state.players[playerIndex]
  if (!player || workersAvailable(state, player) <= 0) {
    return core.emitResponse(false, 'no workers available')
  }
  const space = state.actionSpaces.find((s) => s.id === spaceId)
  if (!space) return core.emitResponse(false, 'space unavailable')
  if (isSpaceOccupied(space)) {
    const allowed = computeAllowedPlacementSpaces(state, player)
    if (!allowed.some(a => a.spaceId === spaceId)) return core.emitResponse(false, 'space unavailable')
  }
  // Honor explicit `isDoable` listener vetoes (e.g. C51 FishingNet blocks
  // opponents with 0 food). We only check listener-driven `doable: false`
  // here — `space.canBeExecutedByPlayer` (which is conservatively false for
  // OR-style flows whose every child is currently undoable) is intentionally
  // skipped, so the existing fall-through-OR semantic in tests is preserved.
  if (core.listenersVetoIsDoableCheck(player, space)) {
    return core.emitResponse(false, 'space unavailable')
  }

  core.appendHistory(true)
  core.setTurnOwner(playerIndex)
  player._activeActionBonusSources = []
  core.setActionStartPlayerSnapshot(core.cloneSessionPlayer(player))
  core.resetCardEffectDeltas()
  recordActionSnapshot(player, core.allocActionToken())
  const worker = smallestAvailableWorker(state, player)
  if (worker) {
    addWorkerRef(space, player.id, worker.id)
  }
  recordRoundPlacement(player, spaceId, worker?.id ?? '?')
  incPlacedFarmers(player)
  state.log.unshift({ key: 'log.placeFarmer', params: { player: player.name, action: space.nameKey } })

  core.pushEngineFrame({
    engine: core.createEngineForSpace(spaceId),
    source: { kind: 'action', actionId: spaceId },
    spaceId,
    ownerPlayerIndex: playerIndex,
    stageResume: null,
    deferredPlayerSwitch: null,
    // Top-level player action engine (frame is the player's current action
    // space, not a sub-flow detour).
    reason: 'top-level',
  })

  const beforeListenerContext = {
    state,
    player,
    space,
    actionId: spaceId,
    phase: 'before' as const,
  }
  const matched = getMatchingListeners(beforeListenerContext)
  const beforeFlowNodes: EngineNode[] = []
  const frameEngine = () => core.peekEngineFrame()?.engine ?? null
  for (const entry of matched) {
    const result = executeCardListener(entry.registration, beforeListenerContext, {
      ownerPlayerId: entry.ownerPlayerId,
    })
    if (result?.flow) {
      beforeFlowNodes.push(frameEngine()!.buildFlowNodePublic(result.flow))
    }
  }
  if (beforeFlowNodes.length > 0) {
    const injectedIds = new Set(beforeFlowNodes.map(n => n.id))
    frameEngine()!.injectBeforeNodes(beforeFlowNodes)
    let safety = beforeFlowNodes.length * 3
    while (safety-- > 0) {
      const eng = frameEngine()
      if (!eng) break
      const next = eng.peekNextUnresolved()
      if (!next || !injectedIds.has(next.id)) break
      const step = eng.proceed({ state, player, space })
      core.flushEngineLogPublic()
      if (step.type !== 'ok') break
    }
    player._activeActionBonusSources = []
    core.setActionStartPlayerSnapshot(core.cloneSessionPlayer(player))
  }

  core.driveEngineSteps()
  return core.emitResponse()
}

/**
 * Promote `confirmNextPlayer` to a synthetic InteractionNode-hosted frame.
 * The accompanying `handleConfirmNextPlayerResolved` (still on GameCore for
 * now) resolves it via `resolveChoice`. The synthetic InteractionNode is
 * the sole source of truth surfaced through `getCurrentPending()` /
 * `buildInteraction()`.
 */
export const startConfirmNextPlayer = (core: GameCore, nextPlayerIndex: number): void => {
  // confirmNextPlayer is only emitted after `engineStack.clear()` in
  // finishCompletedActionTurn / continueAfterReorganize_roundEnd, so we
  // always push a fresh synthetic frame.
  const node = new InteractionNode(
    core.mintSyntheticNodeId('interaction:confirm-next-player'),
    [{ value: 'confirm', labelKey: 'ui.interactionConfirm' }],
    { kind: 'confirm-next-player', nextPlayerIndex },
  )
  node.promptKey = 'ui.confirmNextPlayer'
  core.pushSyntheticInteractionFrame(node, nextPlayerIndex, 'confirm-next-player')
}

/**
 * Mirror of `startConfirmNextPlayer` for the `playerSwitch` flow node /
 * deferredPlayerSwitch detour. Leaves the outer engine frame intact
 * underneath so resolution can pop only the synthetic prompt frame and
 * resume the parent action.
 */
export const startConfirmPlayerSwitch = (
  core: GameCore,
  fromPlayerIndex: number,
  toPlayerIndex: number,
): void => {
  const node = new InteractionNode(
    core.mintSyntheticNodeId('interaction:confirm-player-switch'),
    [{ value: 'confirm', labelKey: 'ui.interactionConfirm' }],
    { kind: 'confirm-player-switch', fromPlayerIndex, toPlayerIndex },
  )
  node.promptKey = 'ui.confirmPlayerSwitch'
  core.pushSyntheticInteractionFrame(node, toPlayerIndex, 'confirm-player-switch')
}

/**
 * Promote `harvestFeed` to an InteractionNode-hosted sub-flow. Each player
 * in the feed queue gets a fresh synthetic frame (recursively pushed by
 * `handleFeedResolved` once the previous player's selections apply).
 */
export const startFeedSubFlow = (
  core: GameCore,
  playerIndex: number,
  remaining: number,
  foodUsed: number,
  feedQueue?: FeedQueueEntry[],
): void => {
  const node = new InteractionNode(
    core.mintSyntheticNodeId('interaction:feed'),
    [{ value: 'confirm', labelKey: 'ui.interactionConfirm' }],
    { kind: 'feed', remaining, foodUsed, feedQueue },
  )
  node.promptKey = 'ui.harvestFeed'
  core.pushSyntheticInteractionFrame(node, playerIndex, 'feed')
}

/**
 * Continuation after the player finishes their reorganize sub-flow during
 * the returning-home phase. Walk to the next pending-animal player; if
 * none, either start the harvest phase (when the round is a harvest round)
 * or finalize the round directly. Migrated from
 * GameCore.continueAfterReorganize_returningHome (S2 Task 10 part 5).
 */
export const continueAfterReorganizeReturningHome = (core: GameCore): void => {
  const nextPending = core.state.players.findIndex((p) => core.hasPendingAnimalsCheck(p))
  if (nextPending !== -1) {
    core.startReorgSubFlow(nextPending, 'returning-home')
    return
  }
  if (core.isHarvestRound(core.state.round)) {
    // Harvest phase entry — call through GameCore so internal accessors
    // still apply (the trampoline wraps continueHarvestFromBeforeHarvest).
    core.invokeHarvestFromBeforeHarvest()
    return
  }
  core.invokeFinalizeRound()
}

/**
 * Continuation after a player's reorganize sub-flow during round-end. If
 * the reorganize was triggered mid-action (originPlayerIndex set), defer
 * to the originating player's onEndTurn hook chain; otherwise finalize
 * the action log and either advance to the next seated player via
 * confirm-next-player or fall through (all-workers-used path is handled
 * by the caller). Migrated from GameCore.continueAfterReorganize_roundEnd
 * (S2 Task 10 part 5).
 */
export const continueAfterReorganizeRoundEnd = (
  core: GameCore,
  playerIndex: number,
  originPlayerIndex: number | null,
): void => {
  if (originPlayerIndex !== null) {
    core.invokeEndTurnHooks(originPlayerIndex)
    return
  }
  const player = core.state.players[playerIndex]!
  core.invokeFinalizeActionLog(player)
  const allUsed = core.state.players.every((p) => workersAvailable(core.state, p) <= 0)
  if (!allUsed) {
    const next = nextSeatedPlayerIdx(core.state, core.state.players, core.state.currentPlayerIndex)
    startConfirmNextPlayer(core, next)
  }
}

/**
 * Anytime-action entry: prepend the chosen anytime entry's flow onto the
 * currently active engine and drive engine steps. Migrated from
 * GameCore.takeAnytimeAction (S2 Task 10 part 4).
 */
export const takeAnytimeAction = (
  core: GameCore,
  playerIndex: number,
  actionId: string,
): SessionResponse => {
  if (core.state.gameOver) return core.emitResponse(false, 'game is over')
  if (playerIndex !== core.state.currentPlayerIndex) return core.emitResponse(false, 'not your turn')
  const engine = core.peekEngine()
  if (!engine || core.readActivePlayerIndex() === null || !core.readActiveSpaceId()) {
    return core.emitResponse(false, 'no active interaction to interrupt')
  }
  const entry = core.listAnytimeEntries().find(
    (candidate) => candidate.descriptor.id === actionId,
  )
  if (!entry) {
    return core.emitResponse(false, 'anytime action unavailable')
  }
  core.appendHistory()
  engine.prependFlow(entry.flow)
  core.driveEngineSteps()
  return core.emitResponse()
}

/**
 * Resolve the synthetic `confirm-player-switch` InteractionNode frame:
 * pop the prompt frame, transfer ownership to `toPlayerIndex` on the
 * parent frame underneath, and resume engine stepping. Migrated from
 * GameCore.handleConfirmPlayerSwitchResolved (S2 Task 10 part 3).
 */
export const handleConfirmPlayerSwitchResolved = (
  core: GameCore,
  toPlayerIndex: number,
): SessionResponse => {
  core.appendHistoryWithUndoBoundary()
  // Pop the synthetic confirm-player-switch frame; the parent action frame
  // beneath it must remain so the deferred sub-flow can resume.
  const top = core.peekEngineFrame()
  if (top?.reason === 'confirm-player-switch') core.popEngineFrame()
  const parent = core.peekEngineFrame()
  if (parent) {
    parent.ownerPlayerIndex = toPlayerIndex
    parent.deferredPlayerSwitch = null
  }
  core.driveEngineSteps()
  return core.emitResponse()
}

/**
 * Resolve the synthetic `confirm-next-player` InteractionNode frame:
 * advance state.currentPlayerIndex, clear engine stack + history, then
 * run the BGA `stLabor()` skip-next loop. If every player's workers are
 * spent, trampoline into `onAllWorkersPlaced` -> performRoundEnd.
 * Migrated from GameCore.handleConfirmNextPlayerResolved (S2 Task 10 part 3).
 */
export const handleConfirmNextPlayerResolved = (
  core: GameCore,
  nextPlayerIndex: number,
): SessionResponse => {
  core.appendHistory()
  core.setCurrentPlayerIndex(nextPlayerIndex)
  // Clear engine state — the synthetic confirm-next-player frame is the only
  // frame on the stack at this point (parent was already cleared by the
  // caller before `startConfirmNextPlayer` pushed us).
  core.clearEngineStack()
  core.setActionStartIndex(null)
  core.clearHistory() // Clear undo history when switching players
  core.setTurnOwner(null)

  const state = core.state
  // Mirrors BGA `stLabor()` SkipNext consumption: dispatch
  // `onBeforePlayerTurn` for the freshly-active player; if any card asks to
  // skip, advance to the next eligible player. Cap at `players.length` to
  // guarantee termination if every player is asked to skip.
  let safety = state.players.length
  while (safety-- > 0) {
    const allWorkersUsedNow = state.players.every((p) => workersAvailable(state, p) <= 0)
    if (allWorkersUsedNow) break
    const current = state.players[state.currentPlayerIndex]
    if (!current) break
    if (workersAvailable(state, current) <= 0) {
      const next = nextSeatedPlayerIdx(state, state.players, state.currentPlayerIndex)
      if (next === state.currentPlayerIndex) break
      state.currentPlayerIndex = next
      continue
    }
    if (!shouldSkipPlayerTurn(state, current)) break
    state.log.unshift({ key: 'log.playerSkipped', params: { playerName: current.name } })
    const next = nextSeatedPlayerIdx(state, state.players, state.currentPlayerIndex)
    if (next === state.currentPlayerIndex) break
    state.currentPlayerIndex = next
  }

  // Check if all workers are used (round end condition)
  const allWorkersUsed = state.players.every((p) => workersAvailable(state, p) <= 0)
  if (allWorkersUsed) {
    return core.invokeAllWorkersPlacedHooks()
  }

  return core.emitResponse()
}
