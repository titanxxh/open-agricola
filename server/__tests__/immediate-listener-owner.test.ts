import { afterEach, describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { requireActiveCardRegistry, getActiveCardRegistry } from '../../shared/cards/active-registry'
import { isActionVetoedInFlowContext } from '../../shared/actions/flow'
import { countPendingExtraTurns } from '../../shared/cards/card-effects'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import { eventsToLogEntries } from '../../shared/events/log-mapper'
import type { SessionResponse } from '../game/authoritative-session'

const PROVIDER = '__immediate_flow_provider__'
const LISTENER = '__immediate_flow_listener__'
const sessions: ReturnType<typeof createWorkSession>[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

const setup = (mode: 'trade-applied' | 'feeding', vetoed: boolean) => {
  const feeding = mode === 'feeding'
  const session = createWorkSession({ configure(state) {
    const player = state.players[0]!
    player.minorPlayed = [PROVIDER, LISTENER]
    player.resources.vegetable = 1
    player.resources.food = 0
    if (feeding) {
      state.round = 4
      state.players.forEach(candidate => {
        markAllWorkersUsed(state, candidate)
        setActiveWorkerCount(candidate, 1)
        candidate.resources.food = 0
      })
      state.players[1]!.resources.vegetable = 1
      player.minorPlayed.push('C059_SchnappsDistillery')
    } else player.improvements = ['Major_Fireplace1']
  } })
  sessions.push(session)
  session.actionHooks.register({
    id: 'test:immediate-owner-veto', actions: ['plow'], phases: ['isDoable'],
    handler: () => vetoed ? { doable: false } : undefined,
  })
  session.withCtx(() => {
    const registry = requireActiveCardRegistry('immediate listener owner test')
    registry.setEffect({
      id: PROVIDER,
      countExtraTurns: (state, player, context) => {
        if (feeding && state.roundPhase !== 'feeding') return 0
        return isActionVetoedInFlowContext({
          actionHooks: context?.actionHooks, state, player,
          space: state.actionSpaces.find(space => space.id === 'farmland')!, actionId: 'plow',
        }) ? 2 : 1
      },
      contributeExtraTurn: state => !feeding || state.roundPhase === 'feeding'
        ? { type: 'leaf', actionId: 'gain', sourceCard: PROVIDER, params: { food: 1 } } : undefined,
    })
    registry.registerListener({
      id: LISTENER, cardIds: [LISTENER], actions: ['trade-applied'], phases: ['immediatelyAfter'],
      handler: () => ({ flow: { type: 'seq', children: [
        { type: 'parallel', children: [
          { type: 'leaf', actionId: 'special-effect', sourceCard: LISTENER, params: { kind: 'consume-pending-extra-turns' } },
          { type: 'leaf', actionId: 'gain', sourceCard: LISTENER, optional: true, params: { stone: 99 } },
          { type: 'leaf', actionId: 'pay', sourceCard: LISTENER, params: { food: 1 } },
        ] },
        { type: 'leaf', actionId: 'gain', sourceCard: LISTENER, params: { stone: 1 } },
      ] } }),
    })
  })
  return session
}

const expectConsumption = (session: ReturnType<typeof setup>, response: SessionResponse, vetoed: boolean) => {
  expect(response.ok, response.error).toBe(true)
  expect(response.state.players[0]!._extraTurnConsumedCountsByCard).toEqual({ [PROVIDER]: vetoed ? 2 : 1 })
  expect(session.withCtx(() => countPendingExtraTurns(session.state, session.state.players[0]!, session.actionHooks))).toBe(0)
  expect(response.state.events.filter(event => event.type === 'card.triggered' && event.cardId === LISTENER))
    .toHaveLength(1)
  const log = eventsToLogEntries(response.state.events, { playerNames: { p1: 'Player 1', p2: 'Player 2' } })
  expect(log.filter(entry => entry.key === 'log.cardTriggered' && entry.params?.cardId === LISTENER))
    .toHaveLength(1)
  expect(getActiveCardRegistry()).toBeNull()
}

describe('immediate listener flows retain their owner', () => {
  it.each([false, true])('settles a cooking trade and consumes the owner extra turns, veto=%s', vetoed => {
    const session = setup('trade-applied', vetoed)
    const offered = session.takeAnytimeAction(0, 'exchange')
    expect(offered.ok, offered.error).toBe(true)
    if (offered.interaction.stateId !== 'wait' || offered.interaction.request.kind !== 'choice') {
      throw new Error('Expected cooking exchange choice')
    }
    const cooking = offered.interaction.request.options.find(option => option.value.startsWith('trade:'))
    if (!cooking) throw new Error('Expected fireplace vegetable trade')

    const response = session.resolveChoice(0, cooking.value)

    expectConsumption(session, response, vetoed)
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 0, food: 2, stone: 1 })
    expect(response.state.events.filter(event => event.type === 'resource.exchanged'))
      .toEqual([expect.objectContaining({ paid: { vegetable: 1 }, gained: { food: 2 }, exchangeSource: 'Major_Fireplace1' })])
    expect(response.interaction.stateId).toBe('idle')
  })

  it.each([false, true])('settles harvest feeding and consumes the owner extra turns, veto=%s', vetoed => {
    const session = setup('feeding', vetoed)
    let offered = session.performRoundEnd()
    for (let step = 0; step < 8 && offered.interaction.stateId === 'wait' &&
      offered.interaction.request.kind === 'choice' &&
      offered.interaction.request.options.some((option) => option.value === '__skip__'); step++) {
      offered = session.resolveChoice(offered.interaction.playerIndex, '__skip__')
      expect(offered.ok, offered.error).toBe(true)
    }
    expect(offered.ok, offered.error).toBe(true)
    expect(offered.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'feed' } })

    const response = session.resolveChoice(0, 'confirm', { selections: [
      { sourceId: 'C059_SchnappsDistillery', exchangeIndex: 0, count: 1, sourceName: 'Schnapps Distillery' },
    ] })

    expectConsumption(session, response, vetoed)
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 0, food: 3, stone: 1, begging: 0 })
    expect(response.state.events.filter(event => event.type === 'harvest.feedConverted'))
      .toEqual([expect.objectContaining({ playerId: 'p1', cost: { vegetable: 1 }, food: { food: 5 } })])
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 1, request: { kind: 'feed' } })
  })
})
