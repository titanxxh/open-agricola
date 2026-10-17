import { describe, expect, it, onTestFinished } from 'vitest'
import { captureStateWithHistory } from '../../shared/session/history-streams'
import { assertRejectedUnchanged, assertSeatResources } from './_helpers/session-assertions'
import { createWorkSession } from './_helpers/session-fixtures'

const setup = () => {
  const session = createWorkSession({
    configure: state => {
      state.players[0].resources.food = 1
      state.players[0].resources.wood = 0
      state.players[1].resources.food = 0
      state.players[1].resources.wood = 0
    },
  })
  onTestFinished(() => session.dispose())
  return session
}

const rewardExpected = () => [
  { playerId: 'p1', resources: { food: 3, wood: 0 } },
  { playerId: 'p2', resources: { food: 0, wood: 0 } },
]

describe('Session resource expectations', () => {
  it('checks literal rewards for the actor and unchanged resources for the idle seat', () => {
    const session = setup()
    const response = session.takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    assertSeatResources({ session, response, fields: ['food', 'wood'], expected: rewardExpected() })
  })

  it('reuses the atomic rejection assertion and checks returned and live resources', () => {
    const session = setup()
    const response = assertRejectedUnchanged(session, () => session.takeAction(1, 'forest'))

    assertSeatResources({
      session, response, fields: ['food', 'wood'],
      expected: [
        { playerId: 'p1', resources: { food: 1, wood: 0 } },
        { playerId: 'p2', resources: { food: 0, wood: 0 } },
      ],
    })
  })

  it('rejects an empty resource field list instead of performing no resource checks', () => {
    const session = setup()
    const response = session.takeAction(0, 'day-laborer')
    const fields: ['food', 'wood'] = ['food', 'wood']
    fields.splice(0)

    expect(() => assertSeatResources({ session, response, fields, expected: rewardExpected() }))
      .toThrow('resource fields must not be empty')
  })

  it('rejects duplicate resource fields instead of silently collapsing them', () => {
    const session = setup()
    const response = session.takeAction(0, 'day-laborer')
    const fields: ['food', 'wood'] = ['food', 'wood']
    Reflect.set(fields, 1, 'food')

    expect(() => assertSeatResources({ session, response, fields, expected: rewardExpected() }))
      .toThrow('resource fields must not contain duplicates')
  })

  it.each(['missing', 'extra'])('rejects an expectation with a %s seat', kind => {
    const session = setup()
    const response = session.takeAction(0, 'day-laborer')
    const expected = rewardExpected()
    if (kind === 'missing') expected.pop()
    else expected.push({ playerId: 'p3', resources: { food: 0, wood: 0 } })

    expect(() => assertSeatResources({ session, response, fields: ['food', 'wood'], expected }))
      .toThrow(`returned seat ${kind === 'missing' ? 1 : 2}: expected`)
  })

  it('rejects a sparse expectation instead of skipping the missing idle seat', () => {
    const session = setup()
    const response = session.takeAction(0, 'day-laborer')
    const expected = rewardExpected()
    Reflect.deleteProperty(expected, '1')

    expect(() => assertSeatResources({ session, response, fields: ['food', 'wood'], expected }))
      .toThrow('returned seat 1: missing expectation')
  })

  it.each(['returned', 'live'])('rejects a missing player seat in %s state', scope => {
    const session = setup()
    const current = session.takeAction(0, 'day-laborer')
    const response = { ...current, state: captureStateWithHistory(current.state) }
    const state = scope === 'returned' ? response.state : session.state
    state.players.pop()

    expect(() => assertSeatResources({ session, response, fields: ['food', 'wood'], expected: rewardExpected() }))
      .toThrow(`${scope} seat 1: expected 2 seats, received 1`)
  })

  it('rejects a missing selected field even when that seat should be unchanged', () => {
    const session = setup()
    const response = session.takeAction(0, 'day-laborer')
    const expected = rewardExpected()
    Reflect.deleteProperty(expected[1].resources, 'wood')

    expect(() => assertSeatResources({ session, response, fields: ['food', 'wood'], expected }))
      .toThrow('returned seat 1 (p2) field wood: missing expectation')
  })

  it('rejects an extra field outside the selected reward or payment resources', () => {
    const session = setup()
    const response = session.takeAction(0, 'day-laborer')
    const expected = [
      { playerId: 'p1', resources: { food: 3, wood: 0, clay: 0 } },
      { playerId: 'p2', resources: { food: 0, wood: 0, clay: 0 } },
    ]

    expect(() => assertSeatResources({ session, response, fields: ['food', 'wood'], expected }))
      .toThrow('returned seat 0 (p1) field clay: extra expectation')
  })

  it('detects a returned-only resource error', () => {
    const session = setup()
    const current = session.takeAction(0, 'day-laborer')
    const response = { ...current, state: captureStateWithHistory(current.state) }
    response.state.players[0].resources.food = 4

    expect(() => assertSeatResources({ session, response, fields: ['food', 'wood'], expected: rewardExpected() }))
      .toThrow('returned seat 0 (p1) field food')
    expect(session.state.players[0].resources.food).toBe(3)
  })

  it('detects a live-only resource error after the returned reward is correct', () => {
    const session = setup()
    const current = session.takeAction(0, 'day-laborer')
    const response = { ...current, state: captureStateWithHistory(current.state) }
    session.state.players[0].resources.food = 4

    expect(() => assertSeatResources({ session, response, fields: ['food', 'wood'], expected: rewardExpected() }))
      .toThrow('live seat 0 (p1) field food')
    expect(response.state.players[0].resources.food).toBe(3)
  })

  it.each(['returned', 'live'])('detects an erroneous resource on the idle bystander in %s state', scope => {
    const session = setup()
    const current = session.takeAction(0, 'day-laborer')
    const response = { ...current, state: captureStateWithHistory(current.state) }
    const state = scope === 'returned' ? response.state : session.state
    state.players[1].resources.wood = 1

    expect(() => assertSeatResources({ session, response, fields: ['food', 'wood'], expected: rewardExpected() }))
      .toThrow(`${scope} seat 1 (p2) field wood`)
  })

  it.each(['returned', 'live'])('rejects a changed player order in %s state', scope => {
    const session = setup()
    const current = session.takeAction(0, 'day-laborer')
    const response = { ...current, state: captureStateWithHistory(current.state) }
    const state = scope === 'returned' ? response.state : session.state
    state.players.reverse()

    expect(() => assertSeatResources({ session, response, fields: ['food', 'wood'], expected: rewardExpected() }))
      .toThrow(`${scope} seat 0 (p1) playerId: identity or order changed`)
  })
})
