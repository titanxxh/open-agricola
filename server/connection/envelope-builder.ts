import type { GameSession, SessionResponse } from '../game/authoritative-session.ts'
import {
  serializeState,
  serializeStateForPlayer,
} from '../../shared/game/serialization.ts'
import type {
  GameSyncPayload,
  StateUpdateCause,
  StateUpdateEnvelope,
} from '../../shared/protocol/game.ts'

type Args = {
  room: { id: string; session: GameSession }
  resp: SessionResponse
  viewerPlayerId: string | null
  version: number
  cause: StateUpdateCause
  requestId?: string
  emittedAt: number
  sync?: 'snapshot'
}

const buildPayload = (args: Args): GameSyncPayload => {
  const { resp, room, viewerPlayerId } = args
  const stateOpts = { engineStack: room.session.getEngineStack() }
  const state = viewerPlayerId === null
    ? serializeState(resp.state, stateOpts)
    : serializeStateForPlayer(resp.state, viewerPlayerId, stateOpts)
  const payload: GameSyncPayload = {
    state,
    interaction: resp.interaction,
    scores: resp.scores ?? null,
    pastureCapacities: resp.pastureCapacities,
    historyLength: resp.historyLength,
    hasActionStartSnapshot: resp.hasActionStartSnapshot,
    ok: resp.ok,
    actionAvailability: resp.actionAvailability,
    cardAvailability: resp.cardAvailability,
    error: resp.error,
  }
  const defs = room.session.getCustomCardDefs()
  if (defs.length > 0) payload.customCardDefs = defs
  return payload
}

export function buildEnvelope(args: Args): StateUpdateEnvelope {
  return {
    type: 'stateUpdate',
    roomId: args.room.id,
    version: args.version,
    sync: args.sync ?? 'snapshot',
    cause: args.cause,
    requestId: args.requestId,
    payload: buildPayload(args),
    emittedAt: args.emittedAt,
  }
}
