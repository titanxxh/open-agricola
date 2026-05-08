/**
 * Server-side `GameSession` — thin wrapper around the shared `GameCore` that
 * pre-injects `registerExecutorBackedCustomCard` so custom card code runs
 * through the isolated-vm executor. Server entrypoints (HTTP / WS handlers)
 * and 240+ session tests instantiate this class directly with a positional
 * `(stateOrSeed?, customCards?, initialStateOptions?)` API; pure shared-side
 * code uses `GameCore` directly.
 */
import type { GameState } from '../../shared/contract/types.ts'
import type { InitialStateOptions } from '../../shared/session/state-bootstrap.ts'
import type { CustomCardData } from '../../shared/cards/session-card-context.ts'
import { GameCore, type StateWithCursor } from '../../shared/session/session-core.ts'
import { registerExecutorBackedCustomCard } from '../custom-code/runtime.ts'

export { type GameCoreOptions, type GameCoreOptions as GameSessionOptions } from '../../shared/session/session-core.ts'
export type { SessionResponse } from '../../shared/session/session-core.ts'

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
}
