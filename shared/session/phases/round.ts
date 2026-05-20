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

import type { ActionFlow, GameState, PlayerState } from '../../contract/types.ts'
import { smallestAvailableWorker, workersAvailable } from '../../domain/player.ts'
import { addWorkerRef, isSpaceOccupied } from '../../domain/space.ts'
import {
  canUseExclusiveSpace,
  computeAllowedPlacementSpaces,
} from '../../actions/helpers/placement-availability.ts'
import { incPlacedFarmers } from '../../session/stats.ts'
import { recordActionSnapshot } from '../../cards/helpers/action-snapshot.ts'
import { recordRoundPlacement } from '../../cards/helpers/round-placement.ts'
import { executeCardListener, getMatchingListeners } from '../../cards/card-listeners.ts'
import { runRoundEndHooks, shouldSkipPlayerTurn } from '../../cards/card-effects.ts'
import { tagInjectedAnytimeFlow } from '../../engine/action-context-flags.ts'
import { appendImmediateEvents } from '../../events/append.ts'
import type { GameCore, SessionResponse } from '../session-core.ts'
import type { FeedQueueEntry } from '../../contract/types.ts'
import type { PendingEnvelope } from '../../engine/types.ts'

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
  if (core.peekEnginePendingEnvelope()) return core.emitResponse(false, 'interaction in progress')
  if (playerIndex !== state.currentPlayerIndex) return core.emitResponse(false, 'not your turn')
  const player = state.players[playerIndex]
  if (!player || workersAvailable(state, player) <= 0) {
    return core.emitResponse(false, 'no workers available')
  }
  const space = state.actionSpaces.find((s) => s.id === spaceId)
  if (!space) return core.emitResponse(false, 'space unavailable')
  if (!canUseExclusiveSpace(space, player, state)) {
    return core.emitResponse(false, 'space unavailable')
  }
  if (isSpaceOccupied(space)) {
    const allowed = computeAllowedPlacementSpaces(state, player)
    if (!allowed.some(a => a.spaceId === spaceId)) return core.emitResponse(false, 'space unavailable')
  }
  // Honor explicit `isDoable` listener vetoes (e.g. C51 FishingNet blocks
  // opponents with 0 food). `space.canBeExecutedByPlayer` is intentionally
  // not used here so OR-style fall-through actions keep their existing route.
  if (core.listenersVetoIsDoableCheck(player, space)) {
    return core.emitResponse(false, 'space unavailable')
  }

  core.appendHistory(true)
  core.setTurnOwner(playerIndex)
  player._activeActionBonusSources = []
  core.setActionStartPlayerSnapshot(core.cloneSessionPlayer(player))
  core.resetActionResultDetails()
  recordActionSnapshot(player, core.allocActionToken())
  const worker = smallestAvailableWorker(state, player)
  if (worker) {
    addWorkerRef(space, player.id, worker.id)
    appendImmediateEvents(state, [{
      type: 'worker.placed',
      workerId: worker.id,
      spaceId,
    }], {
      actorPlayerId: player.id,
      sourceActionId: spaceId,
    })
  }
  recordRoundPlacement(player, spaceId, worker?.id ?? '?')
  incPlacedFarmers(player)

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
  const beforeFlows: ActionFlow[] = []
  for (const entry of matched) {
    const result = executeCardListener(entry.registration, beforeListenerContext, {
      ownerPlayerId: entry.ownerPlayerId,
    })
    if (result?.flow) beforeFlows.push(result.flow)
  }
  if (beforeFlows.length > 0) {
    core.peekEngineFrame()?.engine.injectBeforeFlows(beforeFlows, { state, player, space })
    core.flushEngineLogPublic()
    player._activeActionBonusSources = []
    core.setActionStartPlayerSnapshot(core.cloneSessionPlayer(player))
    core.resetActionResultDetails()
  }

  core.driveEngineSteps()
  return core.emitResponse()
}

/**
 * Promote `confirmNextPlayer` to a synthetic pending frame.
 * The accompanying `handleConfirmNextPlayerResolved` (still on GameCore for
 * now) resolves it via `resolveChoice`.
 */
export const startConfirmNextPlayer = (
  core: GameCore,
  ownerPlayerIndex: number,
  nextPlayerIndex: number,
): void => {
  // confirmNextPlayer is only emitted after `engineStack.clear()` in
  // finishCompletedActionTurn / continueAfterReorganize_roundEnd, so we
  // always push a fresh synthetic frame.
  const options = [{ value: 'confirm', labelKey: 'ui.interactionConfirm' }]
  core.pushSyntheticPendingFrame({
    hostNodeId: core.mintSyntheticNodeId('interaction:confirm-next-player'),
    request: { kind: 'confirm-next-player', nextPlayerIndex },
    choices: options,
    promptKey: 'ui.confirmNextPlayer',
    ownerNodeId: null,
    syntheticKind: 'confirm-next-player',
  } satisfies PendingEnvelope, ownerPlayerIndex, 'confirm-next-player')
}

/**
 * Mirror of `startConfirmNextPlayer` for deferred owner-metadata transitions.
 * The owner switch itself is represented on runtime nodes; this synthetic
 * pending frame only asks the target player to confirm before the parent
 * action frame resumes.
 */
export const startConfirmPlayerSwitch = (
  core: GameCore,
  fromPlayerIndex: number,
  toPlayerIndex: number,
): void => {
  const options = [{ value: 'confirm', labelKey: 'ui.interactionConfirm' }]
  core.pushSyntheticPendingFrame({
    hostNodeId: core.mintSyntheticNodeId('interaction:confirm-player-switch'),
    request: { kind: 'confirm-player-switch', fromPlayerIndex, toPlayerIndex },
    choices: options,
    promptKey: 'ui.confirmPlayerSwitch',
    ownerNodeId: null,
    syntheticKind: 'confirm-player-switch',
  } satisfies PendingEnvelope, toPlayerIndex, 'confirm-player-switch')
}

/**
 * Promote `harvestFeed` to a pending sub-flow. Each player
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
  const options = [{ value: 'confirm', labelKey: 'ui.interactionConfirm' }]
  core.pushSyntheticPendingFrame({
    hostNodeId: core.mintSyntheticNodeId('interaction:feed'),
    request: { kind: 'feed', remaining, foodUsed, feedQueue },
    choices: options,
    promptKey: 'ui.harvestFeed',
    ownerNodeId: null,
    syntheticKind: 'feed',
  } satisfies PendingEnvelope, playerIndex, 'feed')
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
    startConfirmNextPlayer(core, playerIndex, next)
  }
}

/**
 * Wrap up a single action's per-leaf log: emit the action detail, then clear
 * the snapshot + the player's _activeActionBonusSources field. Migrated from
 * GameCore.finalizeActionLog (S2 Task 10 part 6).
 */
export const finalizeActionLog = (core: GameCore, player: PlayerState): void => {
  const before = core.getActionStartPlayerSnapshot()
  if (before) {
    core.invokeLogActionDetail(before, player)
  }
  core.setActionStartPlayerSnapshot(null)
  delete player._activeActionBonusSources
}

/**
 * Round-end entry: validate all-workers-spent + no pending interaction,
 * pivot into a reorganize sub-flow if any player still owes pending
 * animal placement, otherwise mark roundPhase='returning-home' and
 * trampoline into onBeforeReturnHome stage-hook chain. Migrated from
 * GameCore.performRoundEnd (S2 Task 10 part 7).
 */
export const performRoundEnd = (core: GameCore): SessionResponse => {
  const state = core.state
  const allUsed = state.players.every((p) => workersAvailable(state, p) <= 0)
  if (!allUsed) return core.emitResponse(false, 'not all workers used')
  if (core.peekEnginePendingEnvelope()) return core.emitResponse(false, 'pending action exists')

  const pendingAnimal = state.players.findIndex((p) => core.hasPendingAnimalsCheck(p))
  if (pendingAnimal !== -1) {
    core.startReorgSubFlow(pendingAnimal, 'round-end',
      { originPlayerIndex: core.getTurnOwner() ?? undefined })
    return core.emitResponse()
  }

  core.appendHistory()
  state.roundPhase = 'returning-home'
  appendImmediateEvents(state, [{ type: 'returnHome.started' }])
  return core.invokeBeforeReturnHomeHooks()
}

/**
 * Round finalization (after returning-home + post-harvest stage hooks
 * conclude): mark roundPhase='preparation', dispatch the per-player
 * onRoundEnd card hooks, then trampoline into onAfterRoundEnd which
 * eventually advances state.round + flips gameOver at round 15.
 * Migrated from GameCore.finalizeRound (S2 Task 10 part 7).
 */
export const finalizeRound = (core: GameCore): SessionResponse => {
  core.state.roundPhase = 'preparation'
  core.state.players.forEach((p) => runRoundEndHooks(core.state, p))
  return core.invokeAfterRoundEnd()
}

/**
 * Wrap up a player's turn after their action and any onEndTurn stage
 * hook chain finishes: clear engine + turn owner, then enqueue the
 * confirm-next-player prompt for the next eligible player (or fall
 * through to the start-player when all workers are spent so the round
 * advances). Migrated from GameCore.finishCompletedActionTurn
 * (S2 Task 10 part 6).
 */
export const finishCompletedActionTurn = (
  core: GameCore,
  playerIndex: number,
): SessionResponse => {
  const player = core.state.players[playerIndex]
  if (!player) return core.emitResponse(false, 'invalid player')
  finalizeActionLog(core, player)
  core.setTurnOwner(null)
  core.clearEngineStack()
  const allWorkersUsed = core.state.players.every((p) => workersAvailable(core.state, p) <= 0)
  if (!allWorkersUsed) {
    const next = nextSeatedPlayerIdx(core.state, core.state.players, core.state.currentPlayerIndex)
    startConfirmNextPlayer(core, playerIndex, next)
  } else {
    const startIdx = computeStartPlayerIdx(core.state)
    startConfirmNextPlayer(core, playerIndex, startIdx)
  }
  return core.emitResponse()
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
  if (core.state.phase === 'draft') return core.emitResponse(false, 'draft in progress')

  const engine = core.peekEngine()
  const activeOwner = core.readActivePlayerIndex() ?? (engine ? null : core.state.currentPlayerIndex)
  if (activeOwner === null) return core.emitResponse(false, 'no active interaction')
  if (playerIndex !== activeOwner) return core.emitResponse(false, 'not your turn')

  const policy = core.computeAnytimePolicySnapshot()
  if (!policy.allowed) {
    return core.emitResponse(false, `anytime blocked: ${policy.reason}`)
  }

  const entry = core.listAnytimeEntries().find((c) => c.descriptor.id === actionId)
  if (!entry) return core.emitResponse(false, 'anytime action unavailable')

  const activeSpaceId = core.readActiveSpaceId()
  if (engine && !activeSpaceId) {
    return core.emitResponse(false, 'no active engine')
  }

  core.appendHistory()
  if (engine) {
    const owner = core.state.players[playerIndex]
    engine.injectBeforeFlows([tagInjectedAnytimeFlow(entry.flow)], undefined, owner?.id)
  } else {
    const frame = core.buildAdhocEngineFrame(actionId, entry.descriptor.sourceCard, entry.flow)
    core.pushEngineFrame({
      ...frame,
      ownerPlayerIndex: playerIndex,
      spaceId: '__subflow:top-level',
      stageResume: null,
      deferredPlayerSwitch: null,
      reason: 'top-level',
    })
  }
  core.driveEngineSteps()
  return core.emitResponse()
}

/**
 * Resolve the synthetic `confirm-player-switch` pending frame:
 * pop the prompt frame, mark the pending owner transition as confirmed on
 * the parent frame underneath, and resume engine stepping. Migrated from
 * GameCore.handleConfirmPlayerSwitchResolved (S2 Task 10 part 3).
 */
export const handleConfirmPlayerSwitchResolved = (
  core: GameCore,
  fromPlayerIndex: number,
  toPlayerIndex: number,
): SessionResponse => {
  core.appendHistoryWithUndoBoundary()
  // Pop the synthetic confirm-player-switch frame; the parent action frame
  // beneath it must remain so the deferred sub-flow can resume.
  const top = core.peekEngineFrame()
  if (top?.reason === 'confirm-player-switch') core.popEngineFrame()
  const parent = core.peekEngineFrame()
  if (parent) {
    parent.deferredPlayerSwitch = {
      fromPlayerIndex,
      toPlayerIndex,
      confirmed: true,
    }
  }
  core.driveEngineSteps()
  return core.emitResponse()
}

/**
 * Resolve the synthetic `confirm-next-player` pending frame:
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
    appendImmediateEvents(state, [{
      type: 'turn.skipped',
      playerId: current.id,
      reason: 'cardEffect',
    }], { actorPlayerId: current.id })
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
