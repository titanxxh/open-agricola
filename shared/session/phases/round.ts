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
import { workersAvailable } from '../../domain/player.ts'
import { getPlacedAnimalsByType } from '../../domain/animal-zones.ts'
import { findActionSpaceById } from '../../domain/space.ts'
import {
  createMoorSpecialActionSpace,
  validateMoorSpecialAction,
  type MoorSpecialActionPayload,
} from '../../moor/special-actions.ts'
import { MOOR_SPECIAL_ACTION_APPLY_ACTION_ID } from '../../moor/special-action-flow.ts'
import type { MoorSpecialActionId } from '../../moor/types.ts'
import { hasHealthyWorkerAtHome, selectWorkerForMoorAction } from '../../moor/heating.ts'
import { applyActionPlacement, canEnterActionSpace } from '../action-entry-query.ts'
import { endTurnScope, recordActionSnapshot } from '../../cards/helpers/action-snapshot.ts'
import { collectBeforePlacementFlows, runCardListeners } from '../../cards/card-listeners.ts'
import { shouldSkipPlayerTurn, hasPendingExtraTurn, collectExtraTurnFlow, skipPendingExtraTurn } from '../../cards/card-effects.ts'
import { tagInjectedAnytimeFlow } from '../../engine/action-context-flags.ts'
import { appendImmediateEvents } from '../../events/append.ts'
import { hasPendingOrdinaryCardDrawChoice } from '../ordinary-card-draw.ts'
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
    if (candidate && (workersAvailable(state, candidate) > 0 || hasPendingExtraTurn(state, candidate))) return idx
  }
  return current
}

/**
 * Round-work completion predicate. The round's work phase is done only when
 * every player has spent all ordinary workers AND has no pending extra turn
 * (e.g. A92 AdoptiveParents' offspring activation). Replaces the bare
 * `every(p => workersAvailable<=0)` round-end checks so a player owed an extra
 * turn keeps the round open instead of ending it prematurely. Mirrors the
 * extra-turn gating applied to `nextSeatedPlayerIdx` and the rotation skip loop.
 */
export const roundWorkComplete = (state: GameState): boolean =>
  state.players.every((p) => workersAvailable(state, p) <= 0 && !hasPendingExtraTurn(state, p))

const combineFlows = (flows: ActionFlow[]): ActionFlow | undefined => {
  if (flows.length === 0) return undefined
  if (flows.length === 1) return flows[0]
  return { type: 'seq', children: flows }
}

export const startPendingExtraTurnIfAny = (core: GameCore): boolean => {
  if (core.engineStackDepth() > 0) return false
  const state = core.state
  const current = state.players[state.currentPlayerIndex]
  if (!current || workersAvailable(state, current) > 0) return false
  const extra = collectExtraTurnFlow(state, current)
  if (!extra) return false

  core.appendHistory(true)
  core.setTurnOwner(state.currentPlayerIndex)
  current._activeActionBonusSources = []
  core.setActionStartPlayerSnapshot(core.cloneSessionPlayer(current))
  core.resetActionResultDetails()
  recordActionSnapshot(current, core.allocActionToken())
  const frame = core.buildAdhocEngineFrame('extra-turn', extra.cardId, extra.flow)
  core.pushEngineFrame({
    ...frame,
    ownerPlayerIndex: state.currentPlayerIndex,
    spaceId: '__subflow:top-level',
    stageResume: null,
    deferredPlayerSwitch: null,
    reason: 'top-level',
  })
  core.driveEngineSteps()
  return true
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
  if (state.phase === 'parent-selection') return core.emitResponse(false, 'parent selection in progress')
  if (hasPendingOrdinaryCardDrawChoice(state)) {
    return core.emitResponse(false, 'ordinary card draw choice in progress')
  }
  if (core.peekEnginePendingEnvelope()) return core.emitResponse(false, 'interaction in progress')
  if (playerIndex !== state.currentPlayerIndex) return core.emitResponse(false, 'not your turn')
  const player = state.players[playerIndex]
  if (!player) return core.emitResponse(false, 'no workers available')
  const space = findActionSpaceById(state, spaceId)
  if (!space) return core.emitResponse(false, 'space unavailable')
  if (!canEnterActionSpace(state, player, space, {
    vetoesAction: (entry) => core.listenersVetoIsDoableCheck(player, entry),
    isActionDoable: (entry, baseDoable) =>
      core.applyIsDoableCheck(player, entry, baseDoable),
  })) {
    return core.emitResponse(false, 'space unavailable')
  }
  const worker = selectWorkerForMoorAction(state, player, spaceId)
  if (!worker) return core.emitResponse(false, 'no workers available')

  core.appendHistory(true)
  core.setTurnOwner(playerIndex)
  player._activeActionBonusSources = []
  core.setActionStartPlayerSnapshot(core.cloneSessionPlayer(player))
  core.resetActionResultDetails()
  applyActionPlacement(state, player, space, worker.id, core.allocActionToken())

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

  core.recordCompletionScope()
  const beforeFlows = collectBeforePlacementFlows(state, player, space)
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

export const takeSpecialAction = (
  core: GameCore,
  playerIndex: number,
  cardId: string,
  actionId: MoorSpecialActionId,
  payload?: MoorSpecialActionPayload,
): SessionResponse => {
  const state = core.state
  if (state.gameOver) return core.emitResponse(false, 'game is over')
  if (state.phase === 'draft') return core.emitResponse(false, 'draft in progress')
  if (state.phase === 'parent-selection') return core.emitResponse(false, 'parent selection in progress')
  if (hasPendingOrdinaryCardDrawChoice(state)) {
    return core.emitResponse(false, 'ordinary card draw choice in progress')
  }
  if (core.peekEnginePendingEnvelope()) return core.emitResponse(false, 'interaction in progress')
  if (playerIndex !== state.currentPlayerIndex) return core.emitResponse(false, 'not your turn')
  if (state.roundPhase !== 'work') return core.emitResponse(false, 'not work phase')
  if (!state.enableFarmersOfTheMoor || !state.farmersOfTheMoor) {
    return core.emitResponse(false, 'farmers of the moor unavailable')
  }
  const player = state.players[playerIndex]
  if (!player || !hasHealthyWorkerAtHome(state, player)) {
    return core.emitResponse(false, 'no healthy workers available')
  }
  const validation = validateMoorSpecialAction(state, playerIndex, cardId, actionId, payload)
  if (!validation.ok) return core.emitResponse(false, validation.error)

  core.appendHistory(true)
  core.setTurnOwner(playerIndex)
  player._activeActionBonusSources = []
  core.setActionStartPlayerSnapshot(core.cloneSessionPlayer(player))
  core.resetActionResultDetails()
  recordActionSnapshot(player, core.allocActionToken())

  const space = createMoorSpecialActionSpace(actionId)
  const listenerExtraData = { specialActionCardId: cardId, payload }
  const beforeFlows = runCardListeners({
    state,
    player,
    space,
    actionId,
    phase: 'before',
    extraData: listenerExtraData,
  }, undefined, { stampFlowOwner: true })
    .map((entry) => entry.flow)
    .filter((flow): flow is ActionFlow => !!flow)
  const applyFlow: ActionFlow = {
    type: 'leaf',
    actionId: MOOR_SPECIAL_ACTION_APPLY_ACTION_ID,
    params: payload ? { cardId, actionId, payload } : { cardId, actionId },
  }
  const flow = combineFlows([
    ...beforeFlows,
    applyFlow,
  ]) ?? applyFlow
  const frame = core.buildAdhocEngineFrame(actionId, undefined, flow)
  core.pushEngineFrame({
    ...frame,
    ownerPlayerIndex: playerIndex,
    spaceId: actionId,
    stageResume: null,
    deferredPlayerSwitch: null,
    reason: 'top-level',
  })
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
 * pending frame only asks the outgoing player to confirm before the parent
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
  } satisfies PendingEnvelope, fromPlayerIndex, 'confirm-player-switch')
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
  maxTradeTimesBySourceId?: Record<string, number>,
): void => {
  const options = [{ value: 'confirm', labelKey: 'ui.interactionConfirm' }]
  core.pushSyntheticPendingFrame({
    hostNodeId: core.mintSyntheticNodeId('interaction:feed'),
    request: {
      kind: 'feed', remaining, foodUsed, feedQueue, maxTradeTimesBySourceId,
      placedAnimals: getPlacedAnimalsByType(core.state.players[playerIndex]!, core.state),
    },
    choices: options,
    promptKey: 'ui.harvestFeed',
    ownerNodeId: null,
    syntheticKind: 'feed',
  } satisfies PendingEnvelope, playerIndex, 'feed')
}

export const startHeatingSubFlow = (
  core: GameCore,
  playerIndex: number,
  required: number,
  feedQueue?: FeedQueueEntry[],
): void => {
  const player = core.state.players[playerIndex]
  if (!player) return
  const options = [{ value: 'confirm', labelKey: 'ui.interactionConfirm' }]
  core.pushSyntheticPendingFrame({
    hostNodeId: core.mintSyntheticNodeId('interaction:heating'),
    request: {
      kind: 'heating',
      playerId: player.id,
      required,
      maxFuelPayable: Math.min(player.resources.fuel ?? 0, required),
      maxWoodConvertibleToFuel: player.resources.wood,
      feedQueue,
    },
    choices: options,
    promptKey: 'ui.harvestHeating',
    ownerNodeId: null,
    syntheticKind: 'heating',
  } satisfies PendingEnvelope, playerIndex, 'heating')
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
  triggerActionId?: string | null,
): void => {
  if (originPlayerIndex !== null) {
    core.invokeEndTurnHooks(originPlayerIndex, triggerActionId)
    return
  }
  const player = core.state.players[playerIndex]!
  core.invokeFinalizeActionLog(player)
  if (!roundWorkComplete(core.state)) {
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
  if (!roundWorkComplete(state)) return core.emitResponse(false, 'not all workers used')
  if (core.peekEnginePendingEnvelope()) return core.emitResponse(false, 'pending action exists')

  const pendingAnimal = state.players.findIndex((p) => core.hasPendingAnimalsCheck(p))
  if (pendingAnimal !== -1) {
    core.startReorgSubFlow(pendingAnimal, 'round-end',
      { originPlayerIndex: core.getTurnOwner() ?? undefined })
    return core.emitResponse()
  }

  core.appendHistory(false, true)
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
  return core.invokeRoundEndHooks()
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
  endTurnScope(player)
  core.setTurnOwner(null)
  core.clearEngineStack()
  if (!roundWorkComplete(core.state)) {
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
  if (core.state.phase === 'parent-selection') return core.emitResponse(false, 'parent selection in progress')
  if (hasPendingOrdinaryCardDrawChoice(core.state)) {
    return core.emitResponse(false, 'ordinary card draw choice in progress')
  }

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
    core.confirmCurrentDeferredPlayerSwitch(fromPlayerIndex, toPlayerIndex)
  }
  core.driveEngineSteps()
  return core.emitResponse()
}

/**
 * Resolve the synthetic `confirm-next-player` pending frame:
 * advance state.currentPlayerIndex, clear engine stack + history, then
 * run the reference `stLabor` skip-next loop. If every player's workers are
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
  // Mirrors the reference `stLabor` SkipNext consumption: dispatch
  // `onBeforePlayerTurn` for the freshly-active player; if any card asks to
  // skip, advance to the next eligible player. Cap at `players.length` to
  // guarantee termination if every player is asked to skip.
  let safety = state.players.length
  while (safety-- > 0) {
    if (roundWorkComplete(state)) break
    const current = state.players[state.currentPlayerIndex]
    if (!current) break
    // A 0-worker player is normally skipped — unless a card owes them an extra
    // turn (e.g. A92 AdoptiveParents), in which case the rotation stops on them
    // so the contributed flow can be offered below.
    if (workersAvailable(state, current) <= 0 && !hasPendingExtraTurn(state, current)) {
      const next = nextSeatedPlayerIdx(state, state.players, state.currentPlayerIndex)
      if (next === state.currentPlayerIndex) break
      state.currentPlayerIndex = next
      continue
    }
    // Skip-turn effects take priority over an extra turn: consume the skip
    // (single call, so D134-style decrements happen exactly once) and advance.
    // When the skipped player is out of ordinary workers but owed extra turns,
    // consume exactly one extra-turn opportunity.
    const skippedExtraTurn =
      workersAvailable(state, current) <= 0 &&
      collectExtraTurnFlow(state, current) !== null
    if (!shouldSkipPlayerTurn(state, current)) break
    if (skippedExtraTurn) {
      skipPendingExtraTurn(state, current)
    }
    appendImmediateEvents(state, [{
      type: 'turn.skipped',
      playerId: current.id,
      reason: 'cardEffect',
    }], { actorPlayerId: current.id })
    const next = nextSeatedPlayerIdx(state, state.players, state.currentPlayerIndex)
    if (next === state.currentPlayerIndex) {
      if (skippedExtraTurn) {
        safety = Math.max(safety, 1)
        continue
      }
      break
    }
    state.currentPlayerIndex = next
  }

  // Extra-turn injection: the rotation stopped on a player who has no ordinary
  // workers left but is owed a turn-rotation extra action from a card hook.
  // Push the contributed flow as a top-level frame for that player and drive it.
  // place-farmer inside the flow runs in the player's own turn, so alternation
  // is preserved. Ordered before the round-end check so the round stays open.
  if (startPendingExtraTurnIfAny(core)) return core.emitResponse()

  // Check if the round's work phase is done (round end condition). A player
  // whose extra turn was consumed by a mandatory skip above no longer reports
  // that consumed opportunity as pending, so `roundWorkComplete` (here and the
  // re-check in performRoundEnd) can complete the round.
  if (roundWorkComplete(state)) {
    return core.invokeAllWorkersPlacedHooks()
  }

  return core.emitResponse()
}
