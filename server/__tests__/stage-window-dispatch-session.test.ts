import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { StageDispatch } from '../../shared/session/stage-dispatch'
import { flowCardEffectHooks, reactionWindowHooks, roundPreparationHooks } from '../../shared/contract/card-effect-hooks'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { createWorkSession } from './_helpers/session-fixtures'
import { confirmNextPlayer, confirmPlayerSwitch } from './_helpers/pending-confirms'

// #2039 gate: no stage hook resolves outside a window. Every stage hook is a preparation
// hook, the Turn-end hook, or a reaction-window hook, and the last round's end opens each
// reaction window through `StageDispatch.continueReactionWindow`.
const sessions: GameSession[] = []
afterEach(() => {
  sessions.splice(0).forEach(session => session.dispose())
  vi.restoreAllMocks()
})

/** Settles feeding, animals, confirmations and the post-reap anytime window until the game ends. */
const finishGame = (session: GameSession, response: SessionResponse) => {
  for (let step = 0; step < 60 && !response.state.gameOver; step += 1) {
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId !== 'wait') throw new Error(`stalled at ${response.interaction.stateId}`)
    const interaction = response.interaction
    if (interaction.request.kind === 'feed') response = session.resolveChoice(interaction.playerIndex, 'confirm', { selections: [] })
    else if (interaction.request.kind === 'animal-reorg') response = session.resolveChoice(interaction.playerIndex, 'confirm', { zones: interaction.request.zones })
    else if (interaction.request.kind === 'confirm-next-player') response = confirmNextPlayer(session)
    else if (interaction.request.kind === 'confirm-player-switch') response = confirmPlayerSwitch(session)
    else response = session.resolveChoice(interaction.playerIndex, '__skip__')
  }
  expect(response.state.gameOver).toBe(true)
  return response
}

describe('stage windows', () => {
  it('assigns every stage hook to exactly one kind of window', () => {
    const groups = [['onBuy'], [...roundPreparationHooks], ['onEndTurn'], [...reactionWindowHooks]]
    const assigned = groups.flat()
    expect(new Set(assigned).size).toBe(assigned.length)
    expect([...assigned].sort()).toEqual([...flowCardEffectHooks].sort())
  })

  it('opens each reaction window through continueReactionWindow at the end of the last round', () => {
    const opened = new Set<string>()
    const original = StageDispatch.prototype.continueReactionWindow
    vi.spyOn(StageDispatch.prototype, 'continueReactionWindow').mockImplementation(function (this: StageDispatch, hook, order, offset) {
      opened.add(hook)
      return original.call(this, hook, order, offset)
    })
    const session = createWorkSession({ seed: 2039, configure: state => {
      state.round = 14
      for (const player of state.players) {
        markAllWorkersUsed(state, player)
        player.resources.food = 20
      }
    } })
    sessions.push(session)
    finishGame(session, session.performRoundEnd())
    expect([...opened].sort()).toEqual([...reactionWindowHooks].sort())
  })
})
