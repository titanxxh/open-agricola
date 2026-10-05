import { applyHistoryWindow, describeHistory, projectHistoryStateNames } from './history-window'
/**
 * Shared sync-payload assembly — builds the per-viewer `GameSyncPayload` from a
 * `GameCore` response. Used by the server `GameSession` and the browser-local
 * sandbox worker so both ends serialize snapshots identically.
 */
import type { GameSyncPayload } from '../contract/protocol/game.ts'
import {
  filterSerializedStateForPlayer,
  filterPublicEventCancellationsForPlayer,
  serializeState,
  type SerializedGameState,
} from './serialization.ts'
import { privateEventsForViewer } from './interaction-privacy.ts'
import { redactInteractionForViewer } from './interaction-state-adapter.ts'
import type { GameCore, SessionResponse } from './session-core.ts'

/**
 * `viewer` redacts for one seat or a spectator. `dev-viewer` is the same
 * redaction with the round-card order left visible, for dev-room live sync.
 * `debug` is the full authoritative state.
 */
export type SyncPayloadMode = 'viewer' | 'dev-viewer' | 'debug'
/** Room envelopes apply their connection names after windowing; other callers use Session names. */
export type HistoryNameProjection = 'session' | 'deferred'

export function buildSyncPayload(
  core: GameCore,
  resp: SessionResponse,
  viewerPlayerId: string | null,
  mode: SyncPayloadMode = 'viewer',
  serializedState?: SerializedGameState,
  windowed = false,
  historyNameProjection: HistoryNameProjection = 'session',
): GameSyncPayload {
  const ctx = { engineStack: core.getEngineStack() }
  const defs = core.getCustomCardDefs()
  const canonicalState = serializedState ?? core.withCtx(() => serializeState(resp.state, ctx))
  if (mode !== 'debug') describeHistory(canonicalState)
  const base: GameSyncPayload = {
    state: mode === 'debug'
      ? canonicalState
      : filterSerializedStateForPlayer(canonicalState, viewerPlayerId, {
        revealRoundCards: mode === 'dev-viewer',
      }),
    interaction: mode === 'debug'
      ? resp.interaction
      : redactInteractionForViewer(
        resp.interaction,
        resp.state.players.map((player) => player.id),
        viewerPlayerId,
      ),
    scores: resp.scores ?? null,
    pastureCapacities: resp.pastureCapacities,
    historyLength: resp.historyLength,
    hasActionStartSnapshot: resp.hasActionStartSnapshot,
    ok: resp.ok,
    actionAvailability: resp.actionAvailability,
    cardAvailability: mode === 'debug' ||
      viewerPlayerId === resp.state.players[resp.state.currentPlayerIndex]?.id
      ? resp.cardAvailability
      : undefined,
    error: resp.error,
  }

  const playerIds = resp.state.players.map((player) => player.id)
  const privateEvents = mode === 'debug'
    ? []
    : privateEventsForViewer(resp.interaction, playerIds, viewerPlayerId, resp.privateEvents ?? [])
  const publicEventCancellations = mode === 'debug'
    ? resp.publicEventCancellations
    : filterPublicEventCancellationsForPlayer(
      resp.state,
      viewerPlayerId,
      ctx,
      resp.publicEventCancellations,
      canonicalState,
    )

  if (privateEvents.length > 0) base.privateEvents = privateEvents
  if (publicEventCancellations?.length) base.publicEventCancellations = publicEventCancellations
  if (defs.length > 0) base.customCardDefs = defs
  if (mode === 'debug' && core.cardWarnings.length > 0) {
    base.cardWarnings = [...core.cardWarnings]
  }
  const payload = windowed && mode !== 'debug' ? applyHistoryWindow(canonicalState, base, viewerPlayerId) : base
  return mode !== 'debug' && (!windowed || historyNameProjection === 'session')
    ? { ...payload, state: projectHistoryStateNames(payload.state) }
    : payload
}
