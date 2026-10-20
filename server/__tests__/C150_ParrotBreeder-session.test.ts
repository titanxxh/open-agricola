import { afterEach, describe, expect, it } from 'vitest'
import type { GameState } from '../../shared/contract/types'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { isCardFlagged, readCardExtraData, setCardFlag, writeCardExtraData } from '../../shared/cards/helpers/card-state'
import { setWorkersAtHome, workersAvailable } from '../../shared/domain/player'
import { findActionSpaceById } from '../../shared/domain/space'
import { recordRoundPlacement } from '../../shared/cards/helpers/round-placement'
import '../../shared/cards/register-all'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, confirmNext as confirmNext__audit1 } from './_helpers/negative-rule-audit'
import * as auditC150 from './_helpers/audit/ae-negative-C150'

const CARD_ID = 'C150_ParrotBreeder'
const ANYTIME_ID = 'C150-parrot-breeder-anytime'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

// Payment, cross-player tracking, pending, and rotation require Session tests.
// Four players exercise this 4+ card and the seat-3 -> seat-0 neighbour wrap.
const setup = (configure?: (state: GameState) => void, options: { enableFarmersOfTheMoor?: boolean } = {}) => {
  const session = createWorkSession({
    options: { playerCount: 4, ...options },
    configure: state => {
      const owner = state.players[0]!
      owner.occupationPlayed = [CARD_ID]
      owner.resources.grain = 2
      owner.resources.food = 0
      writeCardExtraData(owner, CARD_ID, 'right', 'day-laborer')
      findActionSpaceById(state, 'day-laborer')!.takenBy = [{
        playerId: state.players[3]!.id, workerId: state.players[3]!.workers[0]!.id,
      }]
      configure?.(state)
    },
  })
  sessions.push(session)
  return session
}
const offered = (response: SessionResponse) => response.interaction.anytimeActions.some(entry => entry.id === ANYTIME_ID)
const right = (response: SessionResponse) => readCardExtraData(response.state.players[0]!, CARD_ID, 'right')
const assertRejectedWithoutChanges = (session: GameSession, playerIndex = 0) => {
  const before = JSON.parse(JSON.stringify(session.getState()))
  const response = session.takeAnytimeAction(playerIndex, ANYTIME_ID)
  expect(response.ok).toBe(false)
  expect(JSON.parse(JSON.stringify(response.state))).toEqual(before.state)
  expect(JSON.parse(JSON.stringify(response.interaction))).toEqual(before.interaction)
  expect(JSON.stringify(response.scores)).toBe(JSON.stringify(before.scores))
}
const confirmNext = (session: GameSession, response: SessionResponse, next: number) => {
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'confirm-next-player', nextPlayerIndex: next },
  })
  return session.resolveChoice(next, 'confirm')
}

describe('C150 Parrot Breeder authoritative copy', () => {
  it('under Farmers of the Moor, copies only with a healthy person and skips a lower-numbered sick one', () => {
    const sickOnly = setup(state => { state.players[0]!.sickWorkerIds = ['1', '2'] }, { enableFarmersOfTheMoor: true })
    expect(offered(sickOnly.getState())).toBe(false)

    const session = setup(state => { state.players[0]!.sickWorkerIds = ['1'] }, { enableFarmersOfTheMoor: true })
    expect(offered(session.getState())).toBe(true)
    const response = session.takeAnytimeAction(0, ANYTIME_ID)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(response.state.players[0]!.sickWorkerIds).toEqual(['1'])
    expect(findActionSpaceById(response.state, 'day-laborer')!.takenBy).toEqual([
      { playerId: 'p4', workerId: '1' }, { playerId: 'p1', workerId: '2' },
    ])
  })

  it('pays once and places directly on the sole target, consuming the ordinary turn', () => {
    const session = setup()
    const before = session.getState()
    const logCount = before.state.log.length
    expect(offered(before)).toBe(true)
    const response = session.takeAnytimeAction(0, ANYTIME_ID)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 2 })
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(1)
    expect(findActionSpaceById(response.state, 'day-laborer')!.takenBy).toEqual([
      { playerId: 'p4', workerId: '1' }, { playerId: 'p1', workerId: '1' },
    ])
    expect(right(response)).toBeNull()
    expect(isCardFlagged(response.state.players[0]!, CARD_ID)).toBe(false)
    expect(offered(response)).toBe(false)
    expect(response.state.events.filter(event => event.type === 'resource.paid' && event.resources.grain === 1))
      .toHaveLength(1)
    expect(response.state.events.filter(event => event.type === 'worker.placed' && event.actorPlayerId === 'p1'))
      .toMatchObject([{ spaceId: 'day-laborer' }])
    expect(response.state.log.length).toBeGreaterThan(logCount)
    expect(response.scores).toHaveLength(4)
    expect(response.scores?.[0]).toMatchObject({ playerId: 'p1', total: -12 })
    assertRejectedWithoutChanges(session)
    const next = confirmNext(session, response, 1)
    expect(next.state.currentPlayerIndex).toBe(1)
    expect(next.interaction.stateId).toBe('idle')
    assertRejectedWithoutChanges(session)
  })

  it.each(['no target', 'Meeting Place', 'missing target', 'empty target', 'empty accumulation', 'no grain', 'already flagged', 'no worker', 'not work'])(
    'does not offer or charge for %s', scenario => {
      const session = setup(state => {
        const owner = state.players[0]!
        if (scenario === 'no target') writeCardExtraData(owner, CARD_ID, 'right', null)
        if (scenario === 'missing target') writeCardExtraData(owner, CARD_ID, 'right', '__missing__')
        if (scenario === 'empty target') findActionSpaceById(state, 'day-laborer')!.takenBy = []
        if (scenario === 'Meeting Place' || scenario === 'empty accumulation') {
          const target = scenario === 'Meeting Place' ? 'meeting-place' : 'forest'
          const previous = findActionSpaceById(state, 'day-laborer')!
          findActionSpaceById(state, target)!.takenBy = previous.takenBy
          previous.takenBy = []
          if (target === 'forest') findActionSpaceById(state, target)!.resources.wood = 0
          writeCardExtraData(owner, CARD_ID, 'right', target)
        }
        if (scenario === 'no grain') owner.resources.grain = 0
        if (scenario === 'already flagged') setCardFlag(owner, CARD_ID, true)
        if (scenario === 'no worker') setWorkersAtHome(state, owner, 0)
      })
      if (scenario === 'not work') {
        const state = session.getState().state
        state.roundPhase = 'harvest'
        session.loadState(state)
      }
      expect(offered(session.getState())).toBe(false)
      assertRejectedWithoutChanges(session)
    },
  )

  it('rechecks a stale target and a stale resource balance before payment', () => {
    for (const invalidate of ['target', 'grain']) {
      const session = setup()
      expect(offered(session.getState())).toBe(true)
      const state = session.getState().state
      if (invalidate === 'target') findActionSpaceById(state, 'day-laborer')!.takenBy = []
      else state.players[0]!.resources.grain = 0
      session.loadState(state)
      assertRejectedWithoutChanges(session)
    }
  })

  it('checks target doability after reserving grain and keeps the target own choice', () => {
    const session = setup(state => {
      state.round = 14
      const previous = findActionSpaceById(state, 'day-laborer')!
      findActionSpaceById(state, 'grain-utilization')!.takenBy = previous.takenBy
      previous.takenBy = []
      const owner = state.players[0]!
      owner.resources.grain = 1
      owner.improvements = ['Major_Fireplace1', 'Major_ClayOven']
      writeCardExtraData(owner, CARD_ID, 'right', 'grain-utilization')
    })
    expect(offered(session.getState())).toBe(false)
    assertRejectedWithoutChanges(session)
    const state = session.getState().state
    state.players[0]!.resources.grain = 2
    session.loadState(state)
    expect(offered(session.getState())).toBe(true)
    const pending = session.takeAnytimeAction(0, ANYTIME_ID)
    expect(pending.ok, pending.error).toBe(true)
    expect(pending.state.players[0]!.resources.grain).toBe(1)
    expect(findActionSpaceById(pending.state, 'grain-utilization')!.takenBy).toHaveLength(2)
    expect(pending.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0 })
    expect(offered(pending)).toBe(false)
    assertRejectedWithoutChanges(session)
    const baked = session.resolveChoice(0, 'Major_Fireplace1')
    expect(baked.ok, baked.error).toBe(true)
    expect(baked.state.players[0]!.resources).toMatchObject({ grain: 0, food: 2 })
    expect(baked.state.events.filter(event => event.type === 'resource.paid' && event.resources.grain === 1)).toHaveLength(1)
    expect(right(baked)).toBeNull()
    confirmNext(session, baked, 1)
  })

  it('keeps normal placement free when the player does not activate copying', () => {
    const session = setup()
    const response = session.takeAction(0, 'grain-seeds')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(3)
    expect(right(response)).toBeNull()
    expect(response.state.events.filter(event => event.type === 'resource.paid')).toEqual([])
    expect(offered(response)).toBe(false)
  })

  it('cannot activate from an unfinished ordinary action', () => {
    const session = setup()
    const response = session.takeAction(0, 'farmland')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('wait')
    expect(offered(response)).toBe(false)
    assertRejectedWithoutChanges(session)
  })

  it('undo restores grain, the worker, and the same copy opportunity without duplicate payment', () => {
    const session = setup()
    session.takeAnytimeAction(0, ANYTIME_ID)
    const response = session.undoAction()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 2, food: 0 })
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(2)
    expect(findActionSpaceById(response.state, 'day-laborer')!.takenBy).toEqual([{ playerId: 'p4', workerId: '1' }])
    expect(right(response)).toBe('day-laborer')
    expect(offered(response)).toBe(true)
    expect(response.state.events.filter(event => event.type === 'resource.paid')).toEqual([])
    const retry = session.takeAnytimeAction(0, ANYTIME_ID)
    expect(retry.ok, retry.error).toBe(true)
    expect(retry.state.events.filter(event => event.type === 'resource.paid' && event.resources.grain === 1)).toHaveLength(1)
  })

  it('uses the last actual space after Junior Artist, despite later outer after reactions', () => {
    const session = setup(state => {
      state.currentPlayerIndex = 3
      findActionSpaceById(state, 'day-laborer')!.takenBy = []
      writeCardExtraData(state.players[0]!, CARD_ID, 'right', null)
      state.players[3]!.occupationPlayed = ['B152_JuniorArtist']
      state.players[3]!.resources.food = 5
      findActionSpaceById(state, 'traveling-players')!.resources.food = 3
    })
    const pending = session.takeAction(3, 'day-laborer')
    expect(pending.ok, pending.error).toBe(true)
    expect(pending.interaction).toMatchObject({ stateId: 'wait', playerIndex: 3, sourceCard: 'B152_JuniorArtist' })
    const move = pending.interaction.stateId === 'wait' ? pending.interaction.request.options?.find(option => option.value !== '__skip__') : undefined
    expect(move).toBeDefined()
    const moved = session.resolveChoice(3, move!.value)
    expect(moved.ok, moved.error).toBe(true)
    expect(right(moved)).toBe('traveling-players')
    expect(findActionSpaceById(moved.state, 'day-laborer')!.takenBy).toEqual([])
    const ownerTurn = confirmNext(session, moved, 0)
    expect(offered(ownerTurn)).toBe(false) // The last accumulation space is empty.
    assertRejectedWithoutChanges(session)
  })

  it('tracks the right neighbour through a real turn and copies their last non-accumulation space', () => {
    const session = setup(state => {
      state.currentPlayerIndex = 3
      findActionSpaceById(state, 'day-laborer')!.takenBy = []
      writeCardExtraData(state.players[0]!, CARD_ID, 'right', null)
    })
    const placed = session.takeAction(3, 'day-laborer')
    expect(right(placed)).toBe('day-laborer')
    const ownerTurn = confirmNext(session, placed, 0)
    expect(offered(ownerTurn)).toBe(true)
    const copied = session.takeAnytimeAction(0, ANYTIME_ID)
    expect(copied.ok, copied.error).toBe(true)
    expect(copied.state.players[0]!.resources).toMatchObject({ grain: 1, food: 2 })
    expect(right(copied)).toBeNull()
    confirmNext(session, copied, 1)
  })

  it('clears the target after a non-right opponent placement', () => {
    const session = setup(state => { state.currentPlayerIndex = 1 })
    const response = session.takeAction(1, 'grain-seeds')
    expect(response.ok, response.error).toBe(true)
    expect(right(response)).toBeNull()
    expect(isCardFlagged(response.state.players[0]!, CARD_ID)).toBe(false)
  })

  it('counts copied placement as the second person for Henpecked Husband', () => {
    const session = setup(state => {
      const owner = state.players[0]!
      owner.occupationPlayed.push('D094_HenpeckedHusband')
      owner.resources.wood = 5
      owner.resources.reed = 2
      findActionSpaceById(state, 'grain-seeds')!.takenBy = [{ playerId: owner.id, workerId: '1' }]
      recordRoundPlacement(owner, 'grain-seeds', '1')
      const previous = findActionSpaceById(state, 'day-laborer')!
      findActionSpaceById(state, 'farm-expansion')!.takenBy = previous.takenBy
      previous.takenBy = []
      writeCardExtraData(owner, CARD_ID, 'right', 'farm-expansion')
    })
    let response = session.takeAnytimeAction(0, ANYTIME_ID)
    for (let step = 0; step < 10 && response.interaction.stateId === 'wait'; step += 1) {
      expect(response.ok, response.error).toBe(true)
      const request = response.interaction.request
      if (request.kind === 'confirm-next-player') break
      if (request.kind === 'farm-select' && request.farm.farmType === 'room') {
        response = session.commitSelectionChoice(0, { rooms: [request.farm.selectableTiles[0]!] })
      } else {
        const option = request.options?.find(entry => entry.value !== '__skip__')
        expect(option).toBeDefined()
        response = session.resolveChoice(0, option!.value)
      }
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.roomTiles).toHaveLength(3)
    expect(findActionSpaceById(response.state, 'farm-expansion')!.takenBy)
      .toContainEqual({ playerId: 'p1', workerId: '2' })
    expect(findActionSpaceById(response.state, 'grain-seeds')!.takenBy).toEqual([])
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(1)
    expect(response.state.players[0]!.resources.grain).toBe(1)
  })
})

describe('ae-negative-C150', () => {
  const { CARD, ANYTIME, sessions, setup } = auditC150
  const confirmNext = confirmNext__audit1
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  describe('C150 negative audit: actual right-neighbour turn', () => {
    it('N1 binds payment to the sole target and rejects another placement while confirming the turn', () => {
      const session = setup()
      const copied = session.takeAnytimeAction(0, ANYTIME)
      assert.equal(copied.ok, true, copied.error)
      assert.deepEqual({ grain: copied.state.players[0]!.resources.grain, food: copied.state.players[0]!.resources.food },
        { grain: 0, food: 2 })
      assert.equal(workersAvailable(copied.state, copied.state.players[0]!), 1)
      assert.equal(findActionSpaceById(copied.state, 'day-laborer')!.takenBy.length, 2)
      assert.equal(copied.state.events.filter(event => event.type === 'resource.paid' && event.resources.grain === 1).length, 1)
      assertRejectedUnchanged(session, () => session.takeAction(0, 'grain-seeds'))
      assertRejectedUnchanged(session, () => session.takeAction(0, '__missing__'))
      assertRejectedUnchanged(session, () => session.takeAnytimeAction(0, ANYTIME))
      const next = confirmNext(session, copied)
      assert.equal(next.state.currentPlayerIndex, 1)
      assert.equal(readCardExtraData(next.state.players[0]!, CARD, 'right'), null)
      assert.equal(next.scores?.length, 4)
    })

    it.each([
      { name: 'N2 no grain', grain: 0, target: 'day-laborer' },
      { name: 'N3 Meeting Place', grain: 1, target: 'meeting-place' },
      { name: 'N4 exhausted accumulation', grain: 1, target: 'forest' },
    ])('$name rejects copying without spending resources or a worker', ({ grain, target }) => {
      const session = setup({ grain, target })
      assertRejectedUnchanged(session, () => session.takeAnytimeAction(0, ANYTIME))
      const normal = session.takeAction(0, 'grain-seeds')
      assert.equal(normal.ok, true, normal.error)
      assert.equal(normal.state.players[0]!.resources.grain, grain + 1)
      assert.equal(workersAvailable(normal.state, normal.state.players[0]!), 1)
    })

    it('N5 undo restores the real right-neighbour opportunity, and retry pays exactly once', () => {
      const session = setup()
      assert.equal(session.takeAnytimeAction(0, ANYTIME).ok, true)
      const undone = session.undoAction()
      assert.equal(undone.ok, true, undone.error)
      assert.equal(undone.state.players[0]!.resources.grain, 1)
      assert.equal(undone.state.players[0]!.resources.food, 0)
      assert.equal(workersAvailable(undone.state, undone.state.players[0]!), 2)
      assert.equal(findActionSpaceById(undone.state, 'day-laborer')!.takenBy.length, 1)
      const retry = session.takeAnytimeAction(0, ANYTIME)
      assert.equal(retry.ok, true, retry.error)
      assert.equal(retry.state.players[0]!.resources.food, 2)
      assert.equal(retry.state.events.filter(event => event.type === 'resource.paid' && event.resources.grain === 1).length, 1)
    })

    it.each([1, 2])('N6 reserves the copying grain before admitting a real right-neighbour Sow (grain=$0)', grain => {
      const session = createWorkSession({ seed: 150, options: { playerCount: 4 }, configure: state => {
        state.round = 14
        state.currentPlayerIndex = 3
        state.players[0]!.occupationPlayed = [CARD]
        state.players[0]!.resources.grain = grain
        state.players[0]!.fields = [{ row: 0, col: 2, stacks: [] }]
        state.players[3]!.resources.grain = 1
        state.players[3]!.fields = [{ row: 0, col: 2, stacks: [] }]
      } })
      sessions.push(session)
      let r = session.takeAction(3, 'grain-utilization')
      assert.equal(r.ok, true, r.error)
      if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
        const option = r.interaction.request.options.find(o => o.value === 'sow' || o.labelParams?.actionNameKey === 'actions.sow.name')
        assert.ok(option)
        r = session.resolveChoice(3, option.value)
        assert.equal(r.ok, true, r.error)
      }
      r = session.commitSelectionChoice(3, { crops: [{ row: 0, col: 2, crop: 'grain' }] })
      assert.equal(r.ok, true, r.error)
      confirmNext(session, r)
      if (grain === 1) {
        assertRejectedUnchanged(session, () => session.takeAnytimeAction(0, ANYTIME))
        assert.equal(session.getState().state.players[0]!.resources.grain, 1)
      } else {
        r = session.takeAnytimeAction(0, ANYTIME)
        assert.equal(r.ok, true, r.error)
        assert.equal(r.state.players[0]!.resources.grain, 1)
        r = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'grain' }] })
        assert.equal(r.ok, true, r.error)
        assert.equal(r.state.players[0]!.resources.grain, 0)
        assert.deepEqual(r.state.players[0]!.fields[0]!.stacks, [{ kind: 'grain', remaining: 3 }])
        assert.equal(r.state.events.filter(event => event.type === 'resource.paid' && event.resources.grain === 1).length, 1)
      }
    })
  })
})
