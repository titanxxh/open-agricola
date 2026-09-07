import { describe, expect, it } from 'vitest'
import type { ActionDefinition } from '../../shared/contract/types'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { setWorkersAtHome } from '../../shared/domain/player'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

describe('authoritative command settlement', () => {
  it('publishes an observation when its mandatory host completes in the same command', () => {
    const session = new GameSession(19)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.players[0]!.minorPlayed.push('__TEST_protected_unlocker_card__')
    state.players[0]!.resources.grain = 0
    setWorkersAtHome(state, state.players[0]!, 2)
    session.loadState(state)

    const spaceAction: ActionDefinition = {
      id: 'forest',
      nameKey: 'actions.forest.name',
      descriptionKey: 'actions.forest.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({
        type: 'flow',
        flow: { type: 'leaf', actionId: '__TEST_protected_host__' },
      }),
    }
    const host: ActionDefinition = {
      ...spaceAction,
      id: '__TEST_protected_host__',
      canBeExecutedByPlayer: (_state, player) => player.resources.grain > 0,
      execute: ({ player }) => {
        player.resources.wood += 1
        return { type: 'ok' }
      },
    }
    const unlocker: ActionDefinition = {
      id: '__TEST_protected_unlocker__',
      nameKey: 'actions.forest.name',
      descriptionKey: 'actions.forest.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: ({ state: executionState, player, reportProtectedObservation }) => {
        reportProtectedObservation?.({
          kind: 'random',
          recipientPlayerIds: executionState.players.map((entry) => entry.id),
        })
        player.resources.grain += 1
        return { type: 'ok' }
      },
    }
    const registry = (session as unknown as {
      registry: { register: (entry: ActionDefinition) => void }
    }).registry
    registry.register(spaceAction)
    registry.register(host)
    registry.register(unlocker)
    session.withCtx(() => {
      const cards = requireActiveCardRegistry('protected observation settlement test')
      cards.registerListener({
        id: '__TEST_protected_unlocker_is_doable__',
        cardIds: ['__TEST_protected_unlocker_card__'],
        actions: [host.id],
        phases: ['isDoable'],
        handler: (context) => context.actionContext?.skipBeforeTriggers === true
          ? undefined
          : { doable: true },
      })
      cards.registerListener({
        id: '__TEST_protected_unlocker_before__',
        cardIds: ['__TEST_protected_unlocker_card__'],
        actions: [host.id],
        phases: ['before'],
        handler: () => ({
          flow: { type: 'leaf', actionId: unlocker.id, optional: true },
        }),
      })
    })

    let response = session.takeAction(0, spaceAction.id)
    if (response.interaction.stateId !== 'wait') throw new Error('expected unlocker choice')
    const accept = response.interaction.request.options.find((option) => option.value !== '__skip__')
    response = session.resolveChoice(0, accept!.value)

    expect(response.ok).toBe(true)
    expect(session.createSessionPrivateCursor().provisionalContinuationScopes).toEqual([])
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, wood: 1 })
  })

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
        if (executionState === session.state) throw new Error('test command failure')
        return { type: 'ok' }
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
