import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveNonSkipChoice, resolveTriggerIfPresent } from './_helpers/trigger-select'
import type { SessionResponse } from '../../shared/session/session-core'
import {
  executeCardListener,
  getRegisteredCardListeners,
  type CardListenerContext,
} from '../../shared/cards/card-listeners'

import { setWorkersAtHome } from '../../shared/domain/player'
import { createWorkSession } from './_helpers/session-fixtures'
import { confirmNext } from './_helpers/session-assertions'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { jumpLeaf } from '../../shared/cards/helpers/jump-leaf'
import '../../shared/cards/A/A129_Swagman'
import '../../shared/cards/B/B161_Weakling'
import * as audit30Native from './_helpers/audit/ae-negative-30-native'

const CARD_ID = 'B161_Weakling'
const SWAGMAN_ID = 'A129_Swagman'
const LISTENER_ID = 'B161-weakling-before-place-farmer'

const weaklingGainCount = (resp: SessionResponse): number =>
  resp.state.log.filter((entry) =>
    entry.key === 'log.cardEffectGain' && entry.params?.cardId === CARD_ID,
  ).length

describe('Weakling before the host action', () => {
  const sessions: GameSession[] = []
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

  function sowingSession({ played = true, pile = 5 } = {}) {
    const session = createWorkSession({ options: { playerCount: 4 }, configure: state => {
      state.roundActionOrder[0] = 'grain-utilization'
      for (const space of state.actionSpaces) {
        space.takenBy = []
        space.resources = {}
      }
      state.actionSpaces.find(space => space.id === 'forest')!.resources = { wood: pile }
      const player = state.players[0]!
      player.occupationPlayed = played ? [CARD_ID] : []
      Object.assign(player.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0 })
      player.fields = [{ row: 0, col: 0, stacks: [] }]
      setWorkersAtHome(state, player, 2)
    } })
    sessions.push(session)
    return session
  }

  it('makes Grain Utilization available and sows its vegetable in that same space use', () => {
    const session = sowingSession()
    expect(session.getActionAvailability(0)['grain-utilization']).toBe(true)

    let response = session.takeAction(0, 'grain-utilization')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(1)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') {
      throw new Error('Expected sow selection')
    }
    expect(response.interaction.request.farm.farmType).toBe('sow')

    response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 0, crop: 'vegetable' }] })
    expect(response.ok, response.error).toBe(true)
    response = confirmNext(session, response)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
    expect(response.state.players[0]!.fields).toEqual([{ row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 2 }] }])
    expect(response.interaction.stateId).toBe('idle')
    expect(weaklingGainCount(response)).toBe(1)
    const gain = response.state.events.findIndex(event => event.type === 'resource.moved' && event.sourceCardId === CARD_ID)
    const sow = response.state.events.findIndex(event => event.type === 'farm.sown')
    expect(gain).toBeGreaterThanOrEqual(0)
    expect(sow).toBeGreaterThan(gain)
    expect(response.scores).toHaveLength(4)
  }, 30_000)

  it.each([{ played: false, pile: 5 }, { played: true, pile: 4 }])(
    'does not admit Grain Utilization without its reward: %j', scenario => {
      const session = sowingSession(scenario)
      expect(session.getActionAvailability(0)['grain-utilization']).toBe(false)
      const response = session.takeAction(0, 'grain-utilization')
      expect(response.ok).toBe(false)
      expect(response.interaction.stateId).toBe('idle')
      expect(response.state.players[0]!.resources.vegetable).toBe(0)
      expect(weaklingGainCount(response)).toBe(0)
    }, 30_000,
  )

  it('does not reward a workerless space use during work', () => {
    const session = sowingSession()
    const source = 'TEST_WorkerlessUse'
    session.state.players[0]!.minorPlayed.push(source)
    session.withCtx(() => requireActiveCardRegistry('weakling-workerless-test').registerListener({
      id: 'test-workerless-use', cardIds: [source], actions: ['anytime'], phases: ['anytime'],
      handler: () => ({ sourceCard: source, flow: jumpLeaf({ sourceCard: source, targetSpaceId: 'day-laborer' }) }),
    }))

    const response = session.takeAnytimeAction(0, 'test-workerless-use')

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, vegetable: 0 })
    expect(response.state.actionSpaces.find(space => space.id === 'day-laborer')!.takenBy).toEqual([])
    expect(response.state.events.filter(event => event.type === 'worker.placed')).toEqual([])
    expect(weaklingGainCount(response)).toBe(0)
  }, 30_000)
})

describe('B161_Weakling session', () => {
  const setup = () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 3

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    setWorkersAtHome(state, player, 2)
    state.players[1]!.workersAvailable = 2

    // Pile 6 wood on the Forest to create a 5+ accumulation space
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    if (forest) forest.resources.wood = 6

    session.loadState(state)
    return session
  }

  it('gains 1 vegetable when 5+ space exists and you use a different space', () => {
    const session = setup()
    const before = session.getState().state.players[0]!.resources.vegetable
    // Use day-laborer (accumulation space but with 0 resources)
    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    expect(after.resources.vegetable).toBe(before + 1)
  })

  it('does NOT gain vegetable when using the 5+ space', () => {
    const session = setup()
    const before = session.getState().state.players[0]!.resources.vegetable
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    expect(after.resources.vegetable).toBe(before)
  })

  it('does NOT gain vegetable when no space has 5+ resources', () => {
    const session = setup()
    const state = session.getState().state
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    if (forest) forest.resources.wood = 2 // below threshold
    session.loadState(state)

    const before = state.players[0]!.resources.vegetable
    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    expect(after.resources.vegetable).toBe(before)
  })

  it('gains once for the original space and once for a real-worker Swagman jump', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    state.round = 5
    player.occupationPlayed.push(SWAGMAN_ID)
    player.resources.wood = 2
    player.resources.reed = 0
    session.loadState(state)
    const before = player.resources.vegetable

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok, resp.error).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected stable prompt')
    expect(resp.interaction.request.kind).toBe('farm-select')
    if (resp.interaction.request.kind !== 'farm-select') throw new Error('expected stable prompt')
    expect(resp.interaction.request.farm.farmType).toBe('stable')
    if (resp.interaction.request.farm.farmType !== 'stable') throw new Error('expected stable prompt')
    const stable = resp.interaction.request.farm.selectableTiles[0]!
    resp = session.commitSelectionChoice(0, { stables: [stable] })
    resp = resolveTriggerIfPresent(session, resp, SWAGMAN_ID)
    resp = resolveNonSkipChoice(session, resp)
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)

    expect(resp.state.players[0]!.resources.vegetable).toBe(before + 2)
    expect(weaklingGainCount(resp)).toBe(2)
  })

  it('does not trigger outside the work phase', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    state.roundPhase = 'returning-home'
    const listener = session.withCtx(() => getRegisteredCardListeners()).find((entry) => entry.id === LISTENER_ID)!

    const result = session.withCtx(() => executeCardListener(listener, {
      state,
      player,
      space: state.actionSpaces.find((entry) => entry.id === 'day-laborer')!,
      actionId: 'place-farmer',
      phase: 'before',
      actionContext: { workerId: player.workers[0]!.id },
    } as unknown as CardListenerContext))

    expect(result).toBeUndefined()
  })

  it('does not trigger when no farmer was placed', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const listener = session.withCtx(() => getRegisteredCardListeners()).find((entry) => entry.id === LISTENER_ID)!

    const result = session.withCtx(() => executeCardListener(listener, {
      state,
      player,
      space: state.actionSpaces.find((entry) => entry.id === 'day-laborer')!,
      actionId: 'place-farmer',
      phase: 'before',
      actionContext: { viaCardJump: true, targetSpaceId: 'day-laborer' },
    } as unknown as CardListenerContext))

    expect(result).toBeUndefined()
  })
})

describe('ae-negative-30-native', () => {
  const { sessions, commands, save, make, take, finish, play, undo, pile, res, weak } = audit30Native
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); commands.splice(0); });
  it('B161 N1 real purchase and avoiding a five-good pile gains one vegetable', () => { const b = make('B161_Weakling', st => weak(st, 0), false), bought = finish(b, play(b, 'B161_Weakling')), u = undo(b); res(bought, { vegetable: 0 }); const s = make('B161_Weakling', st => weak(st, 5)), r = finish(s, take(s, 0, 'day-laborer')); res(r, { vegetable: 1, food: 102 }); save('B161-N1', { bought, u, r }); });
  it('B161 N2 four five six and collected qualifying piles enforce exact threshold', () => { for (const [n, use] of [[4, false], [5, false], [6, false], [5, true], [6, true]] satisfies Array<[
      number,
      boolean
  ]>) {
      const s = make('B161_Weakling', st => weak(st, n)), r = finish(s, take(s, 0, use ? 'forest' : 'day-laborer'));
      res(r, { vegetable: !use && n >= 5 ? 1 : 0 });
      save(`B161-N2-${n}-${use}`, r);
  } });
  it('B161 N3 held card foreign turn and nonaccumulating fixed goods do not pay', () => { for (const mode of ['hand', 'opponent', 'fixed']) {
      const a = mode === 'opponent' ? 1 : 0, s = make('B161_Weakling', st => { weak(st, mode === 'fixed' ? 0 : 5); st.currentPlayerIndex = a; if (mode === 'fixed')
          pile(st, 'grain-seeds', 'grain', 5); }, mode !== 'hand'), r = finish(s, take(s, a, 'day-laborer'));
      res(r, { vegetable: 0 });
      save(`B161-N3-${mode}`, r);
  } });
})
