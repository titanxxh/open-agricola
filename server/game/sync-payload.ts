import type { GameSyncPayload } from '../../shared/contract/protocol/game.ts'
import type { GameSession, SessionResponse } from './authoritative-session.ts'
import {
  filterPublicEventCancellationsForPlayer,
  serializeState,
  serializeStateForPlayer,
} from '../../shared/session/serialization.ts'
import { privateEventsForViewer } from '../../shared/session/interaction-privacy.ts'
import { redactInteractionForViewer } from '../../shared/session/interaction-state-adapter.ts'

type SyncPayloadMode = 'viewer' | 'debug'

type Args = {
  session: GameSession
  resp: SessionResponse
  viewerPlayerId: string | null
  mode?: SyncPayloadMode
}

export const buildGameSyncPayload = ({
  session,
  resp,
  viewerPlayerId,
  mode = 'viewer',
}: Args): GameSyncPayload => {
  const ctx = { engineStack: session.getEngineStack() }
  const defs = session.getCustomCardDefs()
  const base: GameSyncPayload = {
    state: mode === 'debug'
      ? serializeState(resp.state, ctx)
      : serializeStateForPlayer(resp.state, viewerPlayerId, ctx),
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
    : filterPublicEventCancellationsForPlayer(resp.state, viewerPlayerId, ctx, resp.publicEventCancellations)

  if (privateEvents.length > 0) base.privateEvents = privateEvents
  if (publicEventCancellations?.length) base.publicEventCancellations = publicEventCancellations
  if (defs.length > 0) base.customCardDefs = defs
  return base
}
