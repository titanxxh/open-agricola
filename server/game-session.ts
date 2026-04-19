/**
 * @deprecated For backward compatibility during PR-1 through PR-3.
 * New code should use `shared/session/game-core.ts` directly and inject
 * `registerExecutorBackedCustomCard` via constructor options.
 *
 * This wrapper preserves the existing positional `GameSession` API for the
 * 242+ session test files, while routing custom card registration through the
 * server's isolated-vm executor path.
 */
import type { GameState } from '../shared/game/types.ts'
import type { InitialStateOptions } from '../shared/logic/state.ts'
import type { CustomCardData } from '../shared/cards/session-card-context.ts'
import { GameCore } from '../shared/session/game-core.ts'
import { registerExecutorBackedCustomCard } from './custom-code-runtime.ts'

export { type GameCoreOptions, type GameCoreOptions as GameSessionOptions } from '../shared/session/game-core.ts'
export type { SessionResponse } from '../shared/session/game-core.ts'

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
