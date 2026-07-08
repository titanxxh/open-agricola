/**
 * Server-side `GameSession` — thin wrapper around the shared `GameCore` that
 * pre-injects `registerExecutorBackedCustomCard` so custom card code runs
 * through the isolated-vm executor. Server entrypoints (HTTP / WS handlers)
 * and 240+ session tests instantiate this class directly with a positional
 * `(stateOrSeed?, customCards?, initialStateOptions?)` API; pure shared-side
 * code uses `GameCore` directly.
 */
import type { GameState } from '../../shared/contract/types.ts'
import type { GameSyncPayload } from '../../shared/contract/protocol/game.ts'
import type { InitialStateOptions } from '../../shared/session/state-bootstrap.ts'
import type { CustomCardData } from '../../shared/cards/session-card-context.ts'
import {
  filterPublicEventCancellationsForPlayer,
  serializeState,
  serializeStateForPlayer,
} from '../../shared/session/serialization.ts'
import { privateEventsForViewer } from '../../shared/session/interaction-privacy.ts'
import { redactInteractionForViewer } from '../../shared/session/interaction-state-adapter.ts'
import { GameCore, type SessionResponse as CoreSessionResponse, type StateWithCursor } from '../../shared/session/session-core.ts'
import { registerExecutorBackedCustomCard } from '../custom-code/runtime.ts'

export { type GameCoreOptions, type GameCoreOptions as GameSessionOptions } from '../../shared/session/session-core.ts'
export type { SessionResponse } from '../../shared/session/session-core.ts'

export type SyncPayloadMode = 'viewer' | 'debug'

export class GameSession extends GameCore {
  constructor(
    stateOrSeed?: GameState | number | StateWithCursor,
    customCards?: CustomCardData[],
    initialStateOptions?: InitialStateOptions,
  ) {
    super({
      stateOrSeed,
      customCards,
      initialStateOptions,
      registerCustomCardImpl: registerExecutorBackedCustomCard,
    })
  }

  buildSyncPayload(
    resp: CoreSessionResponse,
    viewerPlayerId: string | null,
    mode: SyncPayloadMode = 'viewer',
  ): GameSyncPayload {
    const ctx = { engineStack: this.getEngineStack() }
    const defs = this.getCustomCardDefs()
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
}
