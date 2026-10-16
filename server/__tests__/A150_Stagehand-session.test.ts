import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/A/A150_Stagehand'
import { type ActionChoiceOption, type GameState } from '../../shared/contract/types'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import assert from 'node:assert/strict'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext , getChoiceOptions , expectTileFarmSelection } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

function assertTurnFinished(response: SessionResponse) {
  assert.equal(response.ok, true, response.error)
  assert.ok(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player', JSON.stringify(response.interaction))
}

describe('A150_Stagehand session', () => {
  const setup = (playerCount = 4, spaceId = 'traveling-players') => {
    const session = sessionEvidence.track(createWorkSession({ options: { playerCount } }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 1

    const owner = state.players[0]!
    owner.occupationPlayed.push('A150_Stagehand')
    owner.resources = { ...owner.resources, wood: 20, clay: 10, reed: 10, stone: 10 }

    const opponent = state.players[1]!
    setWorkersAtHome(state, opponent, 2)
    const travelingPlayers = state.actionSpaces.find((s) => s.id === spaceId)
    if (!travelingPlayers) throw new Error(`${spaceId} space missing`)
    travelingPlayers.resources.food = 3

    session.loadState(state)
    return session
  }

  it('triggers when an opponent uses traveling-players', () => {
    const session = setup()
    const resp = session.takeAction(1, 'traveling-players')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-player-switch')
    assert.ok(!(!(resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch')), JSON.stringify(resp.interaction))
    expect(resp.interaction.request.fromPlayerIndex).toBe(1)
    expect(resp.interaction.request.toPlayerIndex).toBe(0)
    const grantedLog = resp.state.log.find((entry) => entry.key === 'log.cardGrantedAction')
    expect(grantedLog?.params?.player).toBe(resp.state.players[0]!.name)
  })

  it('triggers when an opponent uses traveling-players-56', () => {
    const session = setup(5, 'traveling-players-56')
    const resp = session.takeAction(1, 'traveling-players-56')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-player-switch')
  })

  it('full flow: switch to owner, skip optional choice, switch back', () => {
    const session = setup()

    let resp = session.takeAction(1, 'traveling-players')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId === 'wait') {
      assert.ok(resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch')
      expect(resp.interaction.request.fromPlayerIndex).toBe(1)
      expect(resp.interaction.request.toPlayerIndex).toBe(0)
    }

    resp = confirmPlayerSwitch(session)
    expect(resp.interaction.stateId).toBe('wait')
    assert.ok(!(resp.interaction.stateId !== 'wait'), JSON.stringify(resp.interaction))
    expect(resp.interaction.playerIndex).toBe(0)

    // First choice: optional "do or skip" wrapping the XOR
    resp = session.resolveChoice(0, '__skip__')
    expect(resp.interaction.stateId).toBe('wait')
    assert.ok(!(resp.interaction.stateId !== 'wait'), JSON.stringify(resp.interaction))
    assert.ok(resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch')
    expect(resp.interaction.request.fromPlayerIndex).toBe(0)
    expect(resp.interaction.request.toPlayerIndex).toBe(1)

    resp = confirmPlayerSwitch(session)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
  })

  it('owner can choose Build Rooms (construct) from the XOR choice', () => {
    const session = setup()

    let resp = session.takeAction(1, 'traveling-players')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId === 'wait') {
      assert.ok(resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch')
      expect(resp.interaction.request.fromPlayerIndex).toBe(1)
      expect(resp.interaction.request.toPlayerIndex).toBe(0)
    }

    resp = confirmPlayerSwitch(session)
    expect(resp.interaction.stateId).toBe('wait')
    assert.ok(!(resp.interaction.stateId !== 'wait'), JSON.stringify(resp.interaction))

    // One-step XOR: fence, stables, construct, skip
    const xorOptions = getChoiceOptions(resp)?.filter((o: ActionChoiceOption) => o.value !== '__skip__') ?? []
    expect(xorOptions.length).toBe(3)

    // Choose construct (find it by label)
    const constructOption = xorOptions.find((o: ActionChoiceOption) => o.labelKey?.includes('construct'))
    expect(constructOption).toBeDefined()
    resp = session.resolveChoice(0, constructOption!.value)
    expect(resp.interaction.stateId).toBe('wait')
    assert.ok(!(resp.interaction.stateId !== 'wait'), JSON.stringify(resp.interaction))
    expect(expectTileFarmSelection(resp, 'room').farmType).toBe('room')
    assert.ok(!(expectTileFarmSelection(resp, 'room').farmType !== 'room'), JSON.stringify(resp.interaction))
    // Rule: Stagehand's construct does not cap room count (unlike A128/D128).
    const roomFarm = expectTileFarmSelection(resp, 'room')
    assert.ok(roomFarm.farmType === 'room')
    expect(roomFarm.maxSelections).toBeGreaterThan(1)

    // Build a room
    resp = session.commitSelectionChoice(0, { rooms: [{ row: 0, col: 0 }] })
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.rooms).toBe(3)

    expect(resp.interaction.stateId).toBe('wait')
    assert.ok(!(resp.interaction.stateId !== 'wait'), JSON.stringify(resp.interaction))
    assert.ok(resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch')
    expect(resp.interaction.request.fromPlayerIndex).toBe(0)
    expect(resp.interaction.request.toPlayerIndex).toBe(1)

    resp = confirmPlayerSwitch(session)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
  })

  it('does not trigger when owner uses traveling-players', () => {
    const session = setup()
    const state = session.getState().state
    state.currentPlayerIndex = 0
    setWorkersAtHome(state, state.players[0]!, 2)
    session.loadState(state)

    const resp = session.takeAction(0, 'traveling-players')
    expect(resp.ok).toBe(true)
    // Owner using the space should NOT trigger stagehand (scope: opponent)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).not.toBe('confirm-player-switch')
  })

  it('does not trigger for non-matching action spaces', () => {
    const session = setup()
    const resp = session.takeAction(1, 'day-laborer')
    expect(resp.ok).toBe(true)
    // No player switch should happen for a different space
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).not.toBe('confirm-player-switch')
  })
})

describe("A150 command boundaries", () => {
  const STAGE = 'A150_Stagehand'
  function save(id: string, value: unknown) {
    sessionEvidence.record(id, value)
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(configure: (state: GameState) => void = () => {
  }, played = true) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: 4 }, configure(state) {
        state.round = 14
        for (const p of state.players)
          Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        state.players[0]!.occupationPlayed = played ? [STAGE] : []
        state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [STAGE, 'A110_Roughcaster']
        configure(state)
      } }))
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
  function drive(s: GameSession, r: SessionResponse, kind: 'room' | 'stable' | 'fence' | null = 'room') {
    for (let n = 0; n < 18 && r.interaction.stateId === 'wait' && r.interaction.request.kind !== 'confirm-next-player'; n++) {
      const i = r.interaction
      if (i.request.kind === 'confirm-player-switch')
        r = ok(s.resolveChoice(i.request.fromPlayerIndex, 'confirm'))
      else if (i.request.kind === 'choice') {
        const label = kind === 'room' ? 'actions.construct.name' : kind === 'stable' ? 'actions.stables.name' : 'actions.fencing.name'
        const o = i.request.options.find(o => kind === null ? o.value === '__skip__' || o.value === '__done__' : o.labelKey === label) ?? i.request.options.find(o => kind === null ? o.value === '__skip__' || o.value === '__done__' : o.value !== '__skip__' && o.value !== '__done__' && !o.disabled)
        assert.ok(o, JSON.stringify(i))
        r = ok(s.resolveChoice(i.playerIndex, o.value))
      }
      else if (i.request.kind === 'farm-select') {
        if (kind === 'room')
          r = ok(s.commitSelectionChoice(i.playerIndex, { rooms: [{ row: 1, col: 1 }] }))
        else if (kind === 'stable')
          r = ok(s.commitSelectionChoice(i.playerIndex, { stables: [{ row: 0, col: 1 }] }))
        else if (kind === 'fence')
          r = ok(s.commitSelectionChoice(i.playerIndex, { edges: ['H-0-2', 'H-1-2', 'V-0-2', 'V-0-3'] }))
        else
          assert.fail(JSON.stringify(i))
      }
      else
        assert.fail(JSON.stringify(i))
    }
    assert.ok(r.interaction.stateId === 'idle' || (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player'), JSON.stringify(r.interaction))
    return r
  }
  function stage(wood = 10, played = true) {
    return setup(state => Object.assign(state.players[0]!.resources, { wood, reed: 2 }), played)
  }
  function offer(s: GameSession) {
    turn(s, 0, 'day-laborer')
    return turn(s, 1, 'traveling-players')
  }
  it("actual opponent Traveling Players permits one ordinary fence stable or room action", () => {
    for (const kind of ['fence', 'stable', 'room'] as const) {
      const s = stage()
      const pending = offer(s)
      const ownerWorkers = structuredClone(pending.state.players[0]!.workers)
      const r = drive(s, pending, kind)
      assert.deepEqual(r.state.players[0]!.workers, ownerWorkers)
      assert.deepEqual(r.state.actionSpaces.flatMap(space => space.takenBy.filter(worker => worker.playerId === r.state.players[0]!.id).map(worker => ({ spaceId: space.id, workerId: worker.workerId }))), [{ spaceId: 'day-laborer', workerId: '1' }])
      assert.equal(r.state.players[0]!.pastures.length, kind === 'fence' ? 1 : 0)
      assert.equal(r.state.players[0]!.stableTiles.length, kind === 'stable' ? 1 : 0)
      assert.equal(r.state.players[0]!.rooms, kind === 'room' ? 3 : 2)
      assert.equal(r.state.players[0]!.resources.wood, kind === 'fence' ? 6 : kind === 'stable' ? 8 : 5)
      assert.equal(r.state.players[1]!.rooms, 2)
      save(`A150-N1-${kind}`, { pending, r })
    }
  })
  it("decline own space unrelated opponent and hand do not grant construction", () => {
    const s = stage()
    const decline = drive(s, offer(s), null)
    assert.equal(decline.state.players[0]!.rooms, 2)
    assert.equal(decline.state.players[0]!.resources.wood, 10)
    const own = turn(stage(), 0, 'traveling-players')
    assertTurnFinished(own)
    assert.equal(own.state.players[0]!.rooms, 2)
    const hs = stage(10, false)
    const hand = offer(hs)
    assertTurnFinished(hand)
    assert.equal(hand.state.players[0]!.rooms, 2)
    const us = stage()
    turn(us, 0, 'day-laborer')
    const unrelated = turn(us, 1, 'fishing')
    assertTurnFinished(unrelated)
    assert.equal(unrelated.state.players[0]!.rooms, 2)
    save('A150-N2', { decline, own, hand, unrelated })
  })
  it("poor owner cannot select unpaid construction and stale choice cannot repeat", () => {
    const ps = stage(0)
    const poor = offer(ps)
    assertTurnFinished(poor)
    assertRejectedUnchanged(ps, () => ps.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }] }))
    assert.equal(poor.state.players[0]!.rooms, 2)
    assert.equal(poor.state.players[0]!.stableTiles.length, 0)
    const s = stage(2)
    const pending = offer(s)
    const r = drive(s, pending, 'stable')
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'build-another-stable'))
    save('A150-N3', { poor, pending, r })
  })
})
