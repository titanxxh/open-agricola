import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { setActiveWorkerCount } from '../../shared/domain/player'
import { recordRoundPlacement, getRoundPersonPlacementDetails } from '../../shared/cards/helpers/round-placement'
import '../../shared/cards/A/A129_Swagman'
import '../../shared/cards/A/A130_MummysBoy'
import '../../shared/cards/C/C158_ForestCampaigner'
import assert from 'node:assert/strict'
import { type GameState } from '../../shared/contract/types'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A129_Swagman'
type Direction = 'farm-expansion' | 'grain-seeds'

// Approved Session seam: fresh two-player work fixtures, real stable payment,
// optional same-person jump, cursor restore, undo, and authoritative board state.
const setup = ({ source = 'farm-expansion', occupied = true, lastPerson = true,
  played = true, wood = 2 }: { source?: Direction; occupied?: boolean; lastPerson?: boolean; played?: boolean; wood?: number } = {}) => sessionEvidence.track(createWorkSession({
  seed: 129,
  configure: state => {
    state.currentPlayerIndex = 0
    const owner = state.players[0]!
    const opponent = state.players[1]!
    owner.occupationPlayed = played ? [CARD_ID] : []
    owner.resources = { ...owner.resources, wood, reed: 0, grain: 0 }
    if (lastPerson) state.actionSpaces.find(space => space.id === 'forest')!.takenBy = [
      { playerId: owner.id, workerId: owner.workers[0]!.id },
    ]
    if (occupied) state.actionSpaces.find(space => space.id === (
      source === 'farm-expansion' ? 'grain-seeds' : 'farm-expansion'))!.takenBy = [
      { playerId: opponent.id, workerId: opponent.workers[0]!.id },
    ]
  },
}))

const buildStable = (session: GameSession, start: SessionResponse): SessionResponse => {
  let response = start
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') throw new Error('expected Farm Expansion choice')
  if (response.interaction.request.kind === 'choice') {
    const stable = getChoiceOptions(response).find(option => option.value.includes('stable'))
    expect(stable, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(0, stable!.value)
    expect(response.ok, response.error).toBe(true)
  }
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select'
    || response.interaction.request.farm.farmType !== 'stable') {
    throw new Error(`expected stable farm selection: ${JSON.stringify(response.interaction)}`)
  }
  response = session.commitSelectionChoice(0, {
    stables: [response.interaction.request.farm.selectableTiles[0]!],
  })
  expect(response.ok, response.error).toBe(true)
  return response
}

const acceptJump = (session: GameSession, start: SessionResponse): SessionResponse => {
  let response = start
  for (let guard = 0; guard < 4; guard++) {
    if (response.interaction.stateId !== 'wait' || !['choice', 'select-trigger'].includes(response.interaction.request.kind)) break
    const accept = getChoiceOptions(response)?.find(option =>
      option.sourceCard === CARD_ID && option.value !== '__skip__')
      ?? (response.interaction.sourceCard === CARD_ID
        ? getChoiceOptions(response)?.find(option => option.value !== '__skip__') : undefined)
    if (!accept) break
    response = session.resolveChoice(0, accept.value)
    expect(response.ok, response.error).toBe(true)
  }
  return response
}

const startJump = (session: GameSession, source: Direction): SessionResponse => {
  const response = session.takeAction(0, source)
  const offered = source === 'farm-expansion' ? buildStable(session, response) : response
  expect(offered.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, sourceCard: CARD_ID })
  return offered
}

describe('A129 same-person jump admission', () => {
  it.each([
    ['farm-expansion', true, true], ['farm-expansion', true, false],
    ['farm-expansion', false, true], ['farm-expansion', false, false],
    ['grain-seeds', true, true], ['grain-seeds', true, false],
    ['grain-seeds', false, true], ['grain-seeds', false, false],
  ] satisfies [Direction, boolean, boolean][])('%s jump: occupied=%s, last person=%s', (source, occupied, lastPerson) => {
    const session = setup({ source, occupied, lastPerson })
    const ownerId = session.state.players[0]!.id
    const workerId = session.state.players[0]!.workers[lastPerson ? 1 : 0]!.id
    const target = source === 'farm-expansion' ? 'grain-seeds' : 'farm-expansion'
    const opponentRefs = structuredClone(session.state.actionSpaces.find(space => space.id === target)!.takenBy)
    let response = acceptJump(session, startJump(session, source))
    if (source === 'grain-seeds') response = buildStable(session, response)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, grain: 1 })
    expect(response.state.players[0]!.stableTiles).toHaveLength(1)
    expect(response.state.actionSpaces.find(space => space.id === source)!.takenBy).toEqual([])
    expect(response.state.actionSpaces.find(space => space.id === target)!.takenBy).toEqual([
      ...opponentRefs, { playerId: ownerId, workerId },
    ])
    expect(getRoundPersonPlacementDetails(response.state.players[0]!)).toHaveLength(1)
    assert.ok(response.interaction.stateId === 'wait')
    expect(response.interaction.sourceCard).not.toBe(CARD_ID)
  })

  it('offers no Farm Expansion jump when the owner cannot pay', () => {
    const session = setup({ source: 'grain-seeds', wood: 0 })
    const response = session.takeAction(0, 'grain-seeds')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(1)
    assert.ok(response.interaction.stateId === 'wait')
    expect(response.interaction.sourceCard).not.toBe(CARD_ID)
    expect(response.state.actionSpaces.find(space => space.id === 'farm-expansion')!.takenBy).toHaveLength(1)
  })

  it('declining leaves the worker on its original space', () => {
    const session = setup()
    const response = startJump(session, 'farm-expansion')
    const declined = session.resolveChoice(0, '__skip__')
    expect(declined.ok, declined.error).toBe(true)
    expect(declined.state.players[0]!.resources.grain).toBe(0)
    expect(declined.state.actionSpaces.find(space => space.id === 'farm-expansion')!.takenBy).toHaveLength(1)
    expect(declined.state.actionSpaces.find(space => space.id === 'grain-seeds')!.takenBy).toHaveLength(1)
    expect(response.state.players[0]!.stableTiles).toHaveLength(1)
  })

  it('restores the pending jump and undoes the whole action without duplicate payment', () => {
    let session = setup()
    const before = { players: structuredClone(session.state.players), actionSpaces: session.state.actionSpaces.map(space => ({ takenBy: structuredClone(space.takenBy) })) }
    startJump(session, 'farm-expansion')
    session = sessionEvidence.track(new GameSession(JSON.parse(JSON.stringify({
      state: session.getState().state, sessionCursor: session.createSessionPrivateCursor(),
    }))))
    const response = acceptJump(session, session.getState())
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, grain: 1 })
    const undo = session.undoAction()
    expect(undo.ok, undo.error).toBe(true)
    expect(undo.state.players[0]!.resources).toEqual(before.players[0]!.resources)
    expect(undo.state.players[0]!.stableTiles).toEqual(before.players[0]!.stableTiles)
    expect(undo.state.actionSpaces.map(space => space.takenBy)).toEqual(before.actionSpaces.map(space => space.takenBy))
  })

  it('moves the newly placed person when another own person already occupies the source', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 129, configure: state => {
      const owner = state.players[0]!
      owner.occupationPlayed = [CARD_ID, 'A130_MummysBoy']
      owner.resources.wood = 2
      owner.resources.reed = 0
      setActiveWorkerCount(owner, 3)
      for (const [index, spaceId] of ['forest', 'grain-seeds'].entries()) {
        state.actionSpaces.find(space => space.id === spaceId)!.takenBy = [
          { playerId: owner.id, workerId: owner.workers[index]!.id },
        ]
        recordRoundPlacement(owner, spaceId, owner.workers[index]!.id)
      }
    } }))
    let response = session.takeAction(0, 'grain-seeds')
    // Two after reactions may require choosing Swagman before its optional flow.
    response = acceptJump(session, response)
    response = buildStable(session, response)
    expect(response.ok, response.error).toBe(true)
    const owner = response.state.players[0]!
    expect(response.state.actionSpaces.find(space => space.id === 'grain-seeds')!.takenBy).toEqual([
      { playerId: owner.id, workerId: owner.workers[1]!.id },
    ])
    expect(response.state.actionSpaces.find(space => space.id === 'farm-expansion')!.takenBy).toEqual([
      { playerId: owner.id, workerId: owner.workers[2]!.id },
    ])
  })

  it('does not repeat new-placement-only Forest Campaigner before reactions on relocation', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.occupationPlayed.push('C158_ForestCampaigner')
    state.players[0]!.resources.food = 0
    state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 8
    session.loadState(state)
    const response = acceptJump(session, startJump(session, 'farm-expansion'))
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, grain: 1, wood: 0 })
  })

  it('ordinary placement remains blocked on occupied spaces without Swagman', () => {
    const session = setup({ played: false })
    const before = { players: structuredClone(session.state.players), actionSpaces: session.state.actionSpaces.map(space => ({ takenBy: structuredClone(space.takenBy) })) }
    const response = session.takeAction(0, 'grain-seeds')
    expect(response.ok).toBe(false)
    expect(response.state.players[0]!.resources).toEqual(before.players[0]!.resources)
    expect(response.state.actionSpaces.map(space => space.takenBy)).toEqual(before.actionSpaces.map(space => space.takenBy))
  })
})

describe("A129 command boundaries", () => {
  const SWAG = 'A129_Swagman'
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(configure: (state: GameState) => void = () => {
  }, played = true) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: 3 }, configure(state) {
        state.round = 14
        for (const p of state.players)
          Object.assign(p.resources, { food: 40, wood: 10, clay: 10, reed: 4, stone: 10, grain: 0, vegetable: 0 })
        state.players[0]!.occupationPlayed = played ? [SWAG] : []
        state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [SWAG, 'A110_Roughcaster']
        configure(state)
      } }))
    assert.equal(s.getState().state.players.length, 3)
    return s
  }
  function turn(s: GameSession, actor: number, space: string) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.currentPlayerIndex, actor)
    return ok(s.takeAction(actor, space))
  }
  function driveSwag(s: GameSession, r: SessionResponse, accept = true) {
    for (let n = 0; n < 15 && r.interaction.stateId === 'wait' && r.interaction.request.kind !== 'confirm-next-player'; n++) {
      const i = r.interaction
      if (i.request.kind === 'farm-select' && i.request.farm.farmType === 'stable')
        r = ok(s.commitSelectionChoice(i.playerIndex, { stables: [{ row: 0, col: 1 }] }))
      else if (i.request.kind === 'choice') {
        const jump = getChoiceOptions({ interaction: i }).find(o => o.sourceCard === SWAG && o.value !== '__skip__')
        const choice = jump ? (accept ? jump : getChoiceOptions({ interaction: i }).find(o => o.value === '__skip__')) : getChoiceOptions({ interaction: i }).find(o => o.labelKey === 'actions.stables.name') ?? getChoiceOptions({ interaction: i }).find(o => o.value === '__skip__' || o.value === '__done__')
        assert.ok(choice, JSON.stringify(i))
        r = ok(s.resolveChoice(i.playerIndex, choice.value))
      }
      else
        assert.fail(JSON.stringify(i))
    }
    return r
  }
  function placements(r: SessionResponse, space: string, owner = 0) {
    return r.state.actionSpaces.find(s => s.id === space)!.takenBy.filter(w => w.playerId === r.state.players[owner]!.id).map(w => w.workerId)
  }
  it("Grain Seeds moves the same person to Farm Expansion once without recursive return", () => {
    const s = setup(state => Object.assign(state.players[0]!.resources, { wood: 2, reed: 0 }))
    const first = turn(s, 0, 'grain-seeds')
    const worker = placements(first, 'grain-seeds')[0]
    const r = driveSwag(s, first)
    assert.equal(r.state.players[0]!.resources.grain, 1)
    assert.equal(r.state.players[0]!.stableTiles.length, 1)
    assert.deepEqual(placements(r, 'grain-seeds'), [])
    assert.deepEqual(placements(r, 'farm-expansion'), [worker])
    assert.equal(r.state.players[0]!.resources.wood, 0)
    sessionEvidence.record('A129-N1', { first, r })
  })
  it("Farm Expansion can move to occupied Grain Seeds without consuming another person", () => {
    const s = setup(state => Object.assign(state.players[0]!.resources, { wood: 2, reed: 0 }))
    turn(s, 0, 'day-laborer')
    turn(s, 1, 'grain-seeds')
    turn(s, 2, 'reed-bank')
    const first = turn(s, 0, 'farm-expansion')
    const worker = placements(first, 'farm-expansion')[0]
    const r = driveSwag(s, first)
    sessionEvidence.record('A129-N2-before-rule-assert', { first, r, worker })
    assert.equal(r.state.players[0]!.stableTiles.length, 1)
    assert.equal(placements(r, 'grain-seeds', 1).length, 1)
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.interaction.stateId, 'wait')
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
    const actual = { grain: r.state.players[0]!.resources.grain, grainWorkers: placements(r, 'grain-seeds'), buildWorkers: placements(r, 'farm-expansion') }
    const undone = ok(s.undoAction())
    assert.equal(undone.state.players[0]!.stableTiles.length, 0)
    assert.equal(undone.state.players[0]!.resources.wood, 2)
    assert.deepEqual(placements(undone, 'farm-expansion'), [])
    assert.equal(placements(undone, 'grain-seeds', 1).length, 1)
    const retry = driveSwag(s, turn(s, 0, 'farm-expansion'))
    assert.equal(retry.state.players[0]!.stableTiles.length, 1)
    assert.deepEqual({ grain: retry.state.players[0]!.resources.grain, grainWorkers: placements(retry, 'grain-seeds'), buildWorkers: placements(retry, 'farm-expansion') }, actual)
    sessionEvidence.record('A129-N2', { first, r, actual, undone, retry })
    assert.deepEqual(actual, { grain: 1, grainWorkers: [worker], buildWorkers: [] })
  })
  it("decline hand and unrelated spaces cannot move farmer or grant a second action", () => {
    for (const played of [true, false]) {
      const s = setup(undefined, played)
      const r = driveSwag(s, turn(s, 0, 'grain-seeds'), false)
      assert.equal(r.state.players[0]!.resources.grain, 1)
      assert.equal(placements(r, 'grain-seeds').length, 1)
      assert.deepEqual(placements(r, 'farm-expansion'), [])
      sessionEvidence.record(`A129-N3-${played}`, r)
    }
    const other = turn(setup(), 0, 'day-laborer')
    assert.equal(other.state.players[0]!.resources.grain, 0)
    sessionEvidence.record('A129-N3-unrelated', other)
  })
  it("unaffordable target and stale choice cannot grant an unpaid room or replay jump", () => {
    const poor = setup(state => Object.assign(state.players[0]!.resources, { wood: 0, reed: 0 }))
    const r = turn(poor, 0, 'grain-seeds')
    assert.equal(placements(r, 'grain-seeds').length, 1)
    assert.equal(r.state.players[0]!.rooms, 2)
    assertRejectedUnchanged(poor, () => poor.resolveChoice(0, 'jump:farm-expansion'))
    sessionEvidence.record('A129-N4', r)
  })
  it("whole action undo restores both locations and yields exactly one stable on retry", () => {
    const s = setup(state => Object.assign(state.players[0]!.resources, { wood: 2, reed: 0 }))
    const first = driveSwag(s, turn(s, 0, 'grain-seeds'))
    const undone = ok(s.undoAction())
    assert.equal(undone.state.players[0]!.resources.grain, 0)
    assert.equal(undone.state.players[0]!.stableTiles.length, 0)
    assert.equal(undone.state.players[0]!.resources.wood, 2)
    assert.deepEqual(placements(undone, 'grain-seeds'), [])
    assert.deepEqual(placements(undone, 'farm-expansion'), [])
    const retry = driveSwag(s, turn(s, 0, 'grain-seeds'))
    assert.equal(retry.state.players[0]!.resources.grain, 1)
    assert.equal(retry.state.players[0]!.stableTiles.length, 1)
    sessionEvidence.record('A129-N5', { first, undone, retry })
  })
})
