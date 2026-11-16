/**
 * Server-side `GameSession` — thin wrapper around the shared `GameCore` with a
 * positional `(stateOrSeed?, customCards?, initialStateOptions?)` API used by
 * server entrypoints (HTTP / WS handlers) and session tests. The server never
 * executes Workshop code (ADR 0052): custom cards given here register their
 * definitions only. Pure shared-side code uses `GameCore` directly.
 */
import type { GameState } from '../../shared/contract/types.ts'
import type { GameSyncPayload } from '../../shared/contract/protocol/game.ts'
import type { SerializedGameState } from '../../shared/session/serialization.ts'
import type { InitialStateOptions } from '../../shared/session/state-bootstrap.ts'
import type { CustomCardData } from '../../shared/cards/session-card-context.ts'
import { GameCore, type GameCoreOptions, type SessionResponse as CoreSessionResponse, type StateWithCursor } from '../../shared/session/session-core.ts'
import { buildSyncPayload, type HistoryNameProjection, type SyncPayloadMode } from '../../shared/session/sync-payload.ts'

export { type GameCoreOptions, type GameCoreOptions as GameSessionOptions } from '../../shared/session/session-core.ts'
export type { SessionResponse } from '../../shared/session/session-core.ts'
export type { SyncPayloadMode } from '../../shared/session/sync-payload.ts'

export class GameSession extends GameCore {
  constructor(
    stateOrSeed?: GameState | number | StateWithCursor,
    customCards?: CustomCardData[],
    initialStateOptions?: InitialStateOptions,
    options: Pick<GameCoreOptions, 'customCardRegistration'> = {},
  ) {
    super({
      stateOrSeed,
      customCards,
      initialStateOptions,
    })
  }

  updatePlayerColors(colors: Array<[number, GameState['players'][number]['color']]>): void {
    for (const [playerIndex, color] of colors) this.state.players[playerIndex]!.color = color
  }

  buildSyncPayload(
    resp: CoreSessionResponse,
    visiblePlayerIds: readonly string[],
    mode: SyncPayloadMode = 'viewer',
    serializedState?: SerializedGameState,
    windowed = false,
    historyNameProjection: HistoryNameProjection = 'session',
  ): GameSyncPayload {
    return buildSyncPayload(this, resp, visiblePlayerIds, mode, serializedState, windowed, historyNameProjection)
  }
}

/** The sync payload for one response, as Rooms and the HTTP sandbox publish it. */
export const buildSessionSyncPayload = (
  session: GameSession,
  response: CoreSessionResponse,
  visiblePlayerIds: readonly string[],
  mode: SyncPayloadMode = 'viewer',
  windowed = false,
  historyNameProjection: HistoryNameProjection = 'session',
): GameSyncPayload => session.buildSyncPayload(response, visiblePlayerIds, mode, undefined, windowed, historyNameProjection)
