import type { SerializedGameState } from '../../shared/session/serialization'
import type { GameState } from '../../shared/contract/types'

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
 *
 * The one client-side migration we still perform is the legacy Field shape
 * (`{crop, remaining}` → `{stacks}`). It's defensive — modern server state
 * already uses `stacks` — but costs nothing and protects against stale
 * persisted JSON making its way to a newer client.
 */
export function rehydrateStateForClient(raw: SerializedGameState): GameState {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const players = (raw as any).players ?? []
  for (const player of players) {
    const fields = player?.fields ?? []
    for (const field of fields) {
      if (field.stacks === undefined) {
        const crop = field.crop
        const remaining = field.remaining ?? 0
        field.stacks =
          crop && remaining > 0 ? [{ kind: crop, remaining }] : []
        delete field.crop
        delete field.remaining
      }
    }
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
  // Callbacks on ActionSpace (flow/canBeExecutedByPlayer/execute/resolveChoice)
  // are undefined after the cast. The client never invokes them.
  return raw as unknown as GameState
}
