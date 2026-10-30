import assert from 'node:assert/strict'
import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, getChoiceOptions } from './_helpers/session-assertions'

const edges = ['V-0-3', 'V-1-3', 'H-2-3', 'H-2-4', 'V-1-5', 'V-0-5', 'H-0-4', 'H-0-3']
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

const setup = (wood: number) => {
  const session = createWorkSession({
    seed: 42,
    configure: state => {
      state.round = 14
      const player = state.players[0]!
      player.houseType = 'clay'
      Object.assign(player.resources, { wood, stone: 2, reed: 1 })
    },
  })
  sessions.push(session)
  return session
}

const startFencing = (session: GameSession, spaceId = 'farm-redevelopment') => {
  let response = session.takeAction(0, spaceId)
  expect(response.ok, response.error).toBe(true)
  if (spaceId === 'farm-redevelopment') {
    expect(response.state.players[0]!.houseType).toBe('stone')
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 0, reed: 0 })
    const fence = getChoiceOptions(response).find(option => option.labelKey === 'actions.fencing.name')
    assert.ok(fence, JSON.stringify(response.interaction))
    response = session.resolveChoice(0, fence.value)
    expect(response.ok, response.error).toBe(true)
  }
  assert.ok(response.interaction.stateId === 'wait')
  assert.ok(response.interaction.request.kind === 'farm-select')
  assert.equal(response.interaction.request.farm.farmType, 'fence')
  return response
}

const quote = (session: GameSession, response: SessionResponse, payload = { edges }) => {
  assert.ok(response.interaction.stateId === 'wait')
  return session.quoteFenceSelection(0, response.interaction.requestKey, payload)
}

describe('farm redevelopment fencing payment', () => {
  it.each([
    { spaceId: 'farm-redevelopment', wood: 10, remaining: 2 },
    { spaceId: 'farm-redevelopment', wood: 8, remaining: 0 },
    { spaceId: 'fencing', wood: 8, remaining: 0 },
  ])('$spaceId builds eight fences from $wood wood and leaves $remaining', ({ spaceId, wood, remaining }) => {
    const session = setup(wood)
    const other = structuredClone(session.state.players[1])
    const pending = startFencing(session, spaceId)
    assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'farm-select')
    expect(pending.interaction.request.farm).not.toHaveProperty('extraWood')
    expect(quote(session, pending)).toMatchObject({ woodCost: 8, affordable: true, valid: true, error: null })

    const done = session.commitSelectionChoice(0, { edges })
    expect(done.ok, done.error).toBe(true)
    expect(done.state.players[0]!.fenceSegments).toHaveLength(8)
    expect(done.state.players[0]!.resources.wood).toBe(remaining)
    expect(done.state.players[1]).toEqual(other)
    expect(done.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    const built = done.state.events.find(event => event.type === 'farm.fenceBuilt')
    assert.ok(built?.type === 'farm.fenceBuilt')
    expect(done.state.events).toContainEqual(expect.objectContaining({
      type: 'resource.paid', paymentId: built.paymentId, paymentFor: 'fencing', resources: { wood: 8 },
    }))
    expect(done.state.log).toContainEqual(expect.objectContaining({
      key: 'log.actionDetail',
      params: expect.objectContaining({ detailParts: expect.objectContaining({
        costs: { wood: 8 }, effects: { fencing: 8 },
      }) }),
    }))
    expect(done.state.gameOver).toBe(false)
  })

  it('does not let a submitted surcharge change the authoritative fence price', () => {
    const session = setup(10)
    const pending = startFencing(session)
    const submitted = { edges, extraWood: 1 }
    expect(quote(session, pending, submitted).woodCost).toBe(8)
    const done = session.commitSelectionChoice(0, submitted)
    expect(done.ok, done.error).toBe(true)
    expect(done.state.players[0]!.resources.wood).toBe(2)
    expect(done.state.players[0]!.fenceSegments).toHaveLength(8)
  })

  it('rejects eight fences with seven wood without changing the pending state', () => {
    const session = setup(7)
    const pending = startFencing(session)
    expect(quote(session, pending)).toMatchObject({ woodCost: 8, affordable: false, valid: false })
    assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { edges }))
    expect(session.state.players[0]!.resources.wood).toBe(7)
    expect(session.state.players[0]!.fenceSegments).toHaveLength(0)
  })
})
