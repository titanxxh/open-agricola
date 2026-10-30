import type { InteractionState } from '../../../shared/contract/types'
import type { GameSession, SessionResponse } from '../../game/authoritative-session'
import { confirmNextPlayer, confirmPlayerSwitch } from './pending-confirms'

export interface AutoAdvanceOptions {
  /** Continue the caller's latest round-end response, even if it already completed the round. */
  initialResponse?: SessionResponse
  /** Defensive max iterations to avoid infinite loops on engine bugs. Default 50. */
  maxIterations?: number
  /**
   * Handler for choice pendings that autoAdvanceRoundEnd doesn't handle
   * natively (feed / animalReorg / confirm-next-player / confirm-player-switch).
   * Receives the live wait `interaction` and the session; return the new
   * `SessionResponse` to keep advancing, or `undefined` to fall through and
   * let `autoAdvanceRoundEnd` throw its strict "hit a choice pending" error.
   */
  onChoice?: (
    interaction: Extract<InteractionState, { stateId: 'wait' }>,
    session: GameSession,
  ) => SessionResponse | undefined
}

export function autoAdvanceRoundEnd(
  session: GameSession,
  opts: AutoAdvanceOptions = {},
): SessionResponse {
  const max = opts.maxIterations ?? 50
  let iter = 0
  // Callers that already issued a round-end command pass its latest response,
  // so a completed harvest never starts another round. Otherwise resume a
  // pending interaction or start round-end, rejecting unsuccessful commands.
  let resp: SessionResponse = opts.initialResponse ?? (session.peekEnginePendingEnvelope()
    ? session.withCtx(() => session.emitResponse())
    : session.performRoundEnd())
  while (iter++ < max) {
    if (!resp.ok) throw new Error(`Round-end command failed: ${resp.error ?? "unknown error"}`)
    if (resp.interaction.stateId !== 'wait' && session.getState().state.gameOver) return resp
    // Round-end already complete: state advanced past the current round
    // (roundPhase==='work' means the next round started) and there's no
    // pending interaction. Return — further performRoundEnd calls would
    // just reject with ok=false and burn iterations.
    if (
      resp.interaction.stateId !== 'wait' &&
      session.getState().state.roundPhase === 'work'
    ) {
      return resp
    }
    if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed') {
      resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', { selections: [] })
      continue
    }
    if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'animal-reorg') {
      // Confirm the server's legal draft, including room permissions and card holders.
      resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', { zones: resp.interaction.request.zones })
      continue
    }
    if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-next-player') {
      resp = confirmNextPlayer(session)
      continue
    }
    if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
      continue
    }
    if (
      resp.interaction.stateId === 'wait' &&
      session.peekEnginePendingEnvelope()?.syntheticKind === 'post-reap-anytime'
    ) {
      resp = session.resolveChoice(resp.interaction.playerIndex, '__skip__')
      continue
    }
    if (resp.interaction.stateId === 'wait') {
      if (opts.onChoice) {
        const next = opts.onChoice(resp.interaction, session)
        if (next !== undefined) {
          resp = next
          continue
        }
      }
      throw new Error(
        `autoAdvanceRoundEnd hit a choice pending — fixture must pre-clear cards that prompt choices during round-end, or supply opts.onChoice. choice: ${JSON.stringify(resp.interaction).slice(0, 200)}`,
      )
    }
    // pending.type === 'none' but game not over → kick next round
    resp = session.performRoundEnd()
  }
  throw new Error(`autoAdvanceRoundEnd exceeded ${max} iterations`)
}
