/**
 * Server-side `GameSession` — thin wrapper around the shared `GameCore` that
 * pre-injects `registerExecutorBackedCustomCard` so custom card code runs
 * through the isolated-vm executor. Server entrypoints (HTTP / WS handlers)
 * and 240+ session tests instantiate this class directly with a positional
 * `(stateOrSeed?, customCards?, initialStateOptions?)` API; pure shared-side
 * code uses `GameCore` directly.
 */
import type { GameState } from '../../shared/game/types.ts'
import type { InitialStateOptions } from '../../shared/logic/state.ts'
import type { CustomCardData } from '../../shared/cards/session-card-context.ts'
import { GameCore } from '../../shared/session/game-core.ts'
import { registerExecutorBackedCustomCard } from '../custom-code/runtime.ts'

export { type GameCoreOptions, type GameCoreOptions as GameSessionOptions } from '../../shared/session/game-core.ts'
export type { SessionResponse } from '../../shared/session/game-core.ts'

export class GameSession extends GameCore {
  constructor(
    stateOrSeed?: GameState | number,
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
