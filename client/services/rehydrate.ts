import type { SerializedGameState, SerializedPlayerState } from '../../shared/session/serialization'
import type { GameState } from '../../shared/contract/types'

/**
 * Client-facing game state. Identical to `GameState` except `players` carry the
 * server-derived snapshot-only display projections (`specialStables`,
 * `playedCardAnimalZones`, `farmCardAnimalZones`, and
 * `borrowedPlayedCardAnimalZones`). The UI reads them directly; they are never
 * written back into the authoritative domain.
 */
export type ClientGameState = Omit<GameState, 'players'> & {
  players: SerializedPlayerState[]
}

/**
 * Lightweight client-side state rehydrator.
 *
 * The client is a pure display layer: it never executes `action.flow`,
 * `action.canBeExecutedByPlayer`, `action.execute`, or `action.resolveChoice`.
 * Those callbacks are stripped by `serializeState()` on the server and we do
 * NOT re-attach them here. As a result this module imports only types and
 * does zero runtime work that would drag in the card catalog
 * (`shared/actions/*`, `shared/cards/*`, `shared/logic/state`).
 *
 * The server's in-memory `GameState` is always fully normalized (runs through
 * `normalizeState` on room creation and server-side mutations maintain
 * invariants), so the serialized payload already contains every field the UI
 * reads — including `activeModifiers`, dynamic `PlayerActionCard` action spaces,
 * normalized pastures / fence segments / room tiles, etc.
 */
export function rehydrateStateForClient(raw: SerializedGameState): ClientGameState {
  // Callbacks on ActionSpace (flow/canBeExecutedByPlayer/execute/resolveChoice)
  // are undefined after the cast. The client never invokes them.
  return raw as unknown as ClientGameState
}
