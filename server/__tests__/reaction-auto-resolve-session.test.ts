import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import type { GameState } from '../../shared/contract/types'
import type { CardListenerRegistration } from '../../shared/cards/card-listeners'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import { createWorkSession } from './_helpers/session-fixtures'
import { orderReactionsManually } from './_helpers/trigger-select'

// #2039: same-timing action reactions follow the chooser's auto-resolve setting.
// L5 (an independent `before` reaction usable by its host) is E51_WhaleOil-session S2b;
// L8 (extra-turn providers stay manual) is M033_M057_moor-final-minors-session.
const GAIN = 'TEST_AfterGain'
const OPTIONAL = 'TEST_AfterOptional'
const PAY = 'TEST_AfterPay'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

const work = (configure: (state: GameState) => void) => {
  const session = createWorkSession({ seed: 2039, configure: state => {
    state.round = 5
    for (const player of state.players) Object.assign(player.resources, { wood: 0, clay: 0, stone: 0, food: 5 })
    for (const space of state.actionSpaces) space.takenBy = []
    state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
    configure(state)
  } })
  sessions.push(session)
  return session
}
const forestAfter = (id: string, flow: NonNullable<ReturnType<CardListenerRegistration['handler']>>['flow']): CardListenerRegistration => ({
  id, cardIds: [id], actionSpaces: ['forest'], phases: ['after'], handler: () => ({ sourceCard: id, flow }),
})
/** Registers test listeners; same-player ones are played by seat 0 so they react to its actions. */
const register = (session: GameSession, registrations: CardListenerRegistration[], owner = 0) => {
  const player = session.state.players[owner]!
  for (const registration of registrations) {
    for (const cardId of registration.cardIds ?? []) if (!player.minorPlayed.includes(cardId)) player.minorPlayed.push(cardId)
  }
  session.withCtx(() => registrations.forEach(registration => requireActiveCardRegistry('reaction auto-resolve test').registerListener(registration)))
}
const ownReactions = (session: GameSession) => register(session, [
  forestAfter(GAIN, { type: 'leaf', actionId: 'gain', params: { food: 1 } }),
  forestAfter(OPTIONAL, { type: 'leaf', actionId: 'gain', optional: true, params: { clay: 1 } }),
])

const waiting = (response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') throw new Error(`expected a waiting interaction, got ${response.interaction.stateId}`)
  return response.interaction
}
const values = (response: SessionResponse) => waiting(response).request.options?.map(option => option.value) ?? []
const passDisabled = (response: SessionResponse) =>
  waiting(response).request.options?.find(option => option.value === '__pass__')?.disabled === true
const choose = (session: GameSession, response: SessionResponse, value: string) => {
  expect(values(response)).toContain(value)
  const next = session.resolveChoice(waiting(response).playerIndex, value)
  expect(next.ok, next.error).toBe(true)
  return next
}
const triggered = (response: SessionResponse, cards: string[]) => response.state.events
  .filter(event => event.type === 'card.triggered' && cards.includes(event.sourceCardId ?? ''))
  .map(event => event.sourceCardId)

describe('L1–L2: one owner’s after reactions', () => {
  it('L1 on: the independent gain settles at once; the optional reaction keeps [card, Pass]', () => {
    const session = work(() => {})
    ownReactions(session)
    let response = session.takeAction(0, 'forest')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, food: 6, clay: 0 })
    expect(values(response)).toEqual([OPTIONAL, '__pass__'])
    expect(passDisabled(response)).toBe(false)
    expect(readCardResourceStats(response.state.players[0]!, GAIN).used).toBe(1)
    response = choose(session, response, '__pass__')
    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(waiting(response).request.kind).toBe('confirm-next-player')
  })

  it.each([GAIN, OPTIONAL])('L2 off: the owner orders both, starting with %s', first => {
    const session = work(orderReactionsManually)
    ownReactions(session)
    let response = session.takeAction(0, 'forest')
    const selector = structuredClone(response.interaction)
    expect(values(response)).toEqual([GAIN, OPTIONAL, '__pass__'])
    expect(passDisabled(response)).toBe(true)
    response = choose(session, response, first)
    if (first === GAIN) {
      expect(values(response)).toEqual([OPTIONAL, '__pass__'])
      response = choose(session, response, OPTIONAL)
    }
    // The optional listener's own flow still asks before it gains.
    expect(waiting(response).sourceCard).toBe(OPTIONAL)
    response = choose(session, response, values(response).find(value => value !== '__skip__')!)
    // After the optional reaction, the gain is the last mandatory source and runs without asking.
    expect(response.state.players[0]!.resources).toMatchObject({ food: 6, clay: 1 })
    expect(triggered(response, [GAIN, OPTIONAL])).toEqual(first === GAIN ? [GAIN, OPTIONAL] : [OPTIONAL, GAIN])
    const undone = session.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    const redone = session.takeAction(0, 'forest')
    expect(redone.interaction).toEqual(selector)
  })
})

describe('L3–L4: reactions owned by another player', () => {
  const quarry = (configure: (state: GameState) => void) => work(state => {
    state.actionSpaces.find(space => space.id === 'eastern-quarry')!.resources.stone = 4
    state.players[1]!.minorPlayed = ['B079_Corf']
    configure(state)
  })

  it('L3 on: the owner’s independent reaction settles in the actor’s command, with no handoff', () => {
    const session = quarry(() => {})
    const response = session.takeAction(0, 'eastern-quarry')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.stone).toBe(4)
    expect(response.state.players[1]!.resources.stone).toBe(1)
    expect(waiting(response)).toMatchObject({ playerIndex: 0, request: { kind: 'confirm-next-player' } })
    // The owner made no decision, so the actor's undo takes the reaction back with the action.
    const undone = session.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[1]!.resources.stone).toBe(0)
  })

  it('L4 owner off: two of the owner’s reactions hand over to the owner, whatever the actor’s setting', () => {
    const opponent = 'TEST_OpponentFood'
    const session = quarry(state => {
      state.players[1]!.preferences = { autoResolveIndependentReactions: false }
    })
    register(session, [{
      id: opponent, cardIds: [opponent], actions: ['collect'], phases: ['after'], scope: 'opponent',
      handler: () => ({ sourceCard: opponent, flow: { type: 'leaf', actionId: 'gain', params: { food: 1 } } }),
    }], 1)
    let response = session.takeAction(0, 'eastern-quarry')
    expect(waiting(response)).toMatchObject({ request: { kind: 'confirm-player-switch' } })
    response = session.resolveChoice(waiting(response).playerIndex, 'confirm')
    expect(waiting(response)).toMatchObject({ playerIndex: 1, request: { kind: 'select-trigger' } })
    expect(values(response)).toEqual(expect.arrayContaining(['B079_Corf', opponent]))
    expect(response.state.players[1]!.resources).toMatchObject({ stone: 0, food: 5 })
  })
})

describe('L6–L7: freezing and non-independent reactions', () => {
  it('L6 an open selector keeps the setting it froze; the next one uses the new setting', () => {
    const third = 'TEST_AfterThird'
    const session = work(state => {
      orderReactionsManually(state)
      state.actionSpaces.find(space => space.id === 'clay-pit')!.resources.clay = 2
    })
    const after = (id: string, resource: 'food' | 'clay' | 'reed'): CardListenerRegistration => ({
      id, cardIds: [id], actionSpaces: ['forest', 'clay-pit'], phases: ['after'],
      handler: () => ({ sourceCard: id, flow: { type: 'leaf', actionId: 'gain', params: { [resource]: 1 } } }),
    })
    register(session, [after(GAIN, 'food'), after(OPTIONAL, 'clay'), after(third, 'reed')])
    let response = session.takeAction(0, 'forest')
    expect(values(response)).toEqual([GAIN, OPTIONAL, third, '__pass__'])
    response = session.setPlayerPreferences(0, { autoResolveIndependentReactions: true })
    expect(response.ok, response.error).toBe(true)
    // This selector froze "off" when it opened, so the two remaining independent gains still wait.
    response = choose(session, response, GAIN)
    expect(values(response)).toEqual([OPTIONAL, third, '__pass__'])
    response = choose(session, response, OPTIONAL)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 6, clay: 1, reed: 1 })
    response = session.resolveChoice(0, 'confirm')
    expect(response.ok, response.error).toBe(true)
    response = session.takeAction(1, 'reed-bank')
    expect(response.ok, response.error).toBe(true)
    response = session.resolveChoice(1, 'confirm')
    expect(response.ok, response.error).toBe(true)
    // The next group reads the new setting: all three gains settle without a selector.
    response = session.takeAction(0, 'clay-pit')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 7, clay: 4, reed: 2 })
    expect(waiting(response).request.kind).toBe('confirm-next-player')
  })

  it('L7 reactions that pay are never independent: the owner orders them in either setting', () => {
    for (const manual of [false, true]) {
      const session = work(state => { if (manual) orderReactionsManually(state) })
      register(session, [
        forestAfter(PAY, { type: 'seq', children: [
          { type: 'leaf', actionId: 'pay', params: { cost: { food: 1 } } },
          { type: 'leaf', actionId: 'gain', params: { clay: 1 } },
        ] }),
        forestAfter(GAIN, { type: 'xor', children: [
          { type: 'leaf', actionId: 'gain', params: { reed: 1 } },
          { type: 'leaf', actionId: 'gain', params: { stone: 1 } },
        ] }),
      ])
      const response = session.takeAction(0, 'forest')
      expect(values(response)).toEqual([PAY, GAIN, '__pass__'])
      expect(passDisabled(response)).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject({ food: 5, clay: 0, reed: 0, stone: 0 })
    }
  })
})
