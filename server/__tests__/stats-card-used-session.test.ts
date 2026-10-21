import { afterEach, describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/B/B144_Collier'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { createWorkSession } from './_helpers/session-fixtures'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { getChoiceOptions } from './_helpers/session-assertions'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

// B144_Collier has a simple space-use `after` listener that fires once per
// Clay Pit visit. We use it as a representative card to assert that
// Internal listener activation increments cardStates[id].extraData.resourceStats.used
// every time a listener fires (the engine-level cross-cutting concern).

describe('per-card used stat', () => {
  const setup = () => {
    const session = new GameSession(undefined, undefined, { playerCount: 4 })
    sessions.push(session)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('B144_Collier')
    setWorkersAtHome(state, player, 2)
    player.resources.wood = 0
    player.resources.reed = 0

    state.players[1]!.workersAvailable = 2
    state.players.slice(2).forEach((extraPlayer) => setWorkersAtHome(state, extraPlayer, 0))

    const clayPit = state.actionSpaces.find((s) => s.id === 'clay-pit')
    if (clayPit) clayPit.resources.clay = 2

    session.loadState(state)
    session.devPlayCard(0, 'B144_Collier')
    return session
  }

  it('increments cardStates.used when B144 listener fires', () => {
    const session = setup()
    const resp = session.takeAction(0, 'clay-pit')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    expect(after.players[0]!.resources).toMatchObject({ clay: 2, wood: 1, reed: 1 }) // listener actually fired
    const stats = readCardResourceStats(after.players[0]!, 'B144_Collier')
    expect(stats?.used).toBe(1)
  })

  it('does not write used when listener does not fire (other space)', () => {
    const session = setup()
    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    const stats = readCardResourceStats(session.getState().state.players[0]!, 'B144_Collier')
    expect(stats?.used ?? 0).toBe(0)
  })

  it('counts a before space-use reward once, leaves queries pure, and restores the count on undo', () => {
    const card = 'A042_ForestLakeHut'
    const session = createWorkSession({ seed: 42, configure: state => {
      const player = state.players[0]!
      player.minorPlayed = [card]
      Object.assign(player.resources, { wood: 0, food: 0 })
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
    } })
    sessions.push(session)
    const initialScores = session.getState().scores
    for (let i = 0; i < 2; i++) {
      expect(session.getActionAvailability(0).forest).toBe(true)
      expect(readCardResourceStats(session.getState().state.players[0]!, card)).toBeUndefined()
    }
    const use = () => {
      const response = session.takeAction(0, 'forest')
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, food: 1 })
      expect(readCardResourceStats(response.state.players[0]!, card)).toMatchObject({ used: 1, gained: { food: 1 } })
      expect(response.state.events.filter(event => event.type === 'card.triggered' && event.sourceCardId === card)).toHaveLength(1)
      expect(response.state.log.filter(log => log.key === 'log.cardTriggered' && log.params?.cardId === card)).toHaveLength(1)
      expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('confirm-next-player')
      expect(response.scores).toEqual(initialScores)
    }
    use()
    expect(session.undoAction().ok).toBe(true)
    expect(session.getState().state.players[0]!.resources).toMatchObject({ wood: 0, food: 0 })
    expect(readCardResourceStats(session.getState().state.players[0]!, card)).toBeUndefined()
    use()
  }, 30_000)
})

describe('listener usage boundaries', () => {
  const card = 'TEST_CardUse'
  const make = ({ selector = 'space', phase = 'before', ownerIndex = 0, countCardUse = true, optional = false }: {
    selector?: 'space' | 'placement'
    phase?: 'before' | 'after'
    ownerIndex?: number
    countCardUse?: boolean
    optional?: boolean
  } = {}) => {
    const session = createWorkSession({ seed: 42, configure: state => {
      state.players[ownerIndex]!.minorPlayed = [card]
      for (const player of state.players) Object.assign(player.resources, { food: 0, wood: 0, clay: 0 })
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
    } })
    sessions.push(session)
    const register = (target: GameSession) => target.withCtx(() => requireActiveCardRegistry('card-use-test').registerListener({
      id: 'test-card-use', cardIds: [card], phases: [phase], scope: ownerIndex === 0 ? 'player' : 'opponent',
      ...(selector === 'space' ? { actionSpaces: 'all' } : { actions: ['place-farmer'] }),
      handler: context => context.space.id === 'forest' ? { sourceCard: card, countCardUse, flow: {
        type: 'seq', optional, targetPlayerId: context.ownerPlayer?.id,
        children: [
          { type: 'leaf', actionId: 'gain', sourceCard: card, params: { food: 1 } },
          { type: 'leaf', actionId: 'gain', sourceCard: card, params: { clay: 1 } },
        ],
      } } : undefined,
    }))
    register(session)
    return { session, register }
  }

  it.each(['space', 'placement'] as const)('counts one %s before activation with multiple reward leaves only once', selector => {
    const { session } = make({ selector })
    const response = session.takeAction(0, 'forest')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, food: 1, clay: 1 })
    expect(readCardResourceStats(response.state.players[0]!, card)).toMatchObject({ used: 1, gained: { food: 1, clay: 1 } })
  })

  it('preserves countCardUse: false without suppressing the reward', () => {
    const { session } = make({ countCardUse: false })
    const response = session.takeAction(0, 'forest')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, food: 1, clay: 1 })
    expect(readCardResourceStats(response.state.players[0]!, card)).toMatchObject({ used: 0, gained: { food: 1, clay: 1 } })
  })

  it('does not count a matching before listener that returns no flow', () => {
    const { session } = make()
    const response = session.takeAction(0, 'day-laborer')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, clay: 0 })
    expect(readCardResourceStats(response.state.players[0]!, card)).toBeUndefined()
    expect(response.state.events.filter(event => event.type === 'card.triggered' && event.sourceCardId === card)).toHaveLength(0)
  })

  it('records an opponent before activation on the card owner rather than the worker actor', () => {
    const { session } = make({ ownerIndex: 1 })
    const response = session.takeAction(0, 'forest')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, food: 0, clay: 0 })
    expect(readCardResourceStats(response.state.players[0]!, card)).toBeUndefined()
    expect(response.state.players[1]!.resources).toMatchObject({ wood: 0, food: 1, clay: 1 })
    expect(readCardResourceStats(response.state.players[1]!, card)).toMatchObject({ used: 1, gained: { food: 1, clay: 1 } })
  })

  it.each(['before', 'after'] as const)('counts a returned optional %s effect once even when skipped, including restored pending', phase => {
    const fixture = make({ phase, optional: true })
    let session = fixture.session
    let response = session.takeAction(0, 'forest')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('choice')
    expect(getChoiceOptions(response).map(option => option.value)).toContain('__skip__')
    expect(readCardResourceStats(response.state.players[0]!, card)?.used).toBe(1)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, clay: 0 })
    session = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))))
    sessions.push(session)
    fixture.register(session)
    for (let i = 0; i < 2; i++) {
      session.getActionAvailability(0)
      expect(readCardResourceStats(session.getState().state.players[0]!, card)?.used).toBe(1)
    }
    response = session.resolveChoice(0, '__skip__')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, food: 0, clay: 0 })
    expect(readCardResourceStats(response.state.players[0]!, card)?.used).toBe(1)
    expect(response.state.events.filter(event => event.type === 'card.triggered' && event.sourceCardId === card)).toHaveLength(0)
    expect(response.state.log.filter(log => log.key === 'log.cardTriggered' && log.params?.cardId === card)).toHaveLength(0)
    expect(response.scores).toHaveLength(2)
  })
})
