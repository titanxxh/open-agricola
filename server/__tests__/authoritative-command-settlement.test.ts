import { describe, expect, it } from 'vitest'
import type { ActionDefinition } from '../../shared/contract/types'
import { setWorkersAtHome } from '../../shared/domain/player'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

describe('authoritative command settlement', () => {
  it('restores the complete command entry checkpoint when execution throws', () => {
    const session = new GameSession(19)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    setWorkersAtHome(state, state.players[0]!, 2)

    const action: ActionDefinition = {
      id: 'forest',
      nameKey: 'actions.forest.name',
      descriptionKey: 'actions.forest.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: ({ player, state: executionState }) => {
        player.resources.wood += 4
        executionState.rngTick = (executionState.rngTick ?? 0) + 1
        throw new Error('test command failure')
      },
    }
    ;(session as unknown as { registry: { register: (entry: ActionDefinition) => void } })
      .registry.register(action)
    session.loadState(state)
    const before = JSON.parse(JSON.stringify(session.state))

    expect(() => session.takeAction(0, action.id)).toThrow('test command failure')
    expect(JSON.parse(JSON.stringify(session.state))).toEqual(before)
    expect(session.getEngineStack().depth()).toBe(0)
    expect(session.getState()).toMatchObject({ historyLength: 0, hasActionStartSnapshot: false })
  })
})
