import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import '../../shared/cards/A/A149_HouseArtist'
import '../../shared/cards/A/A150_Stagehand'
import assert from 'node:assert/strict'
import { type GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext , getChoiceOptions , expectTileFarmSelection , undoRuleSnapshot , assertUndoRestored } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

function assertTurnFinished(response: SessionResponse, actor: number) {
  assert.equal(response.ok, true, response.error)
  assert.equal(response.state.players.length, 4)
  assert.ok(response.interaction.stateId === 'wait', JSON.stringify(response.interaction))
  assert.deepEqual(response.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: (actor + 1) % 4 })
  assert.equal(response.interaction.playerIndex, actor)
  assert.equal(response.state.currentPlayerIndex, actor)
  assert.equal(response.state.roundPhase, 'work')
}

const FILLER = '__test_placeholder__'

const setup = (cardId: string, actor = 0, played = true) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 7149, options: { playerCount: 4 } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = 5
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === actor ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [cardId]
  owner.occupationPlayed = played ? [cardId] : []
  owner.resources.wood = 5
  owner.resources.reed = 2
  state.actionSpaces.find((space) => space.id === 'traveling-players')!.resources.food = 3
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession, cardId: string) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(cardId)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = getChoiceOptions(response)?.find((candidate) => candidate.value === cardId)
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

const chooseNonSkip = (session: GameSession, response: SessionResponse, label = '') => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = getChoiceOptions(response)?.find((candidate) => {
    return candidate.value !== '__skip__' && (!label || candidate.labelKey?.includes(label))
  })
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const buildFirstRoom = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'room' } },
  })
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') return response
  return session.commitSelectionChoice(response.interaction.playerIndex, {
    rooms: [expectTileFarmSelection(response, 'room').selectableTiles[0]!],
  })
}

describe('A149 House Artist parity', () => {
  it('A149 S1: House Artist can be played as the first occupation in a four-player game', () => {
    expect(playOccupation(setup('A149_HouseArtist', 0, false), 'A149_HouseArtist')
      .state.players[0]!.occupationPlayed).toContain('A149_HouseArtist')
  })

  it('A149 S2: using Traveling Players may build a wooden room for five wood and one reed', () => {
    const session = setup('A149_HouseArtist')
    let response = session.takeAction(0, 'traveling-players')
    response = chooseNonSkip(session, response)
    response = buildFirstRoom(session, response)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 1 })
  })

  it('A149 S3: the House Artist room action may be declined', () => {
    const session = setup('A149_HouseArtist')
    const response = session.takeAction(0, 'traveling-players')
    expect(response.interaction.stateId).toBe('wait')
    const declined = session.resolveChoice(0, '__skip__')
    expect(declined.state.players[0]!.rooms).toBe(2)
    expect(declined.state.players[0]!.resources).toMatchObject({ wood: 5, reed: 2 })
  })

  it('A149 S4: an opponent using Traveling Players grants no House Artist action', () => {
    const response = setup('A149_HouseArtist', 1).takeAction(1, 'traveling-players')
    expect(response.state.players[0]!.rooms).toBe(2)
    expect(response.interaction.stateId !== 'wait' || response.interaction.sourceCard !== 'A149_HouseArtist').toBe(true)
  })
})

describe('A150 Stagehand parity', () => {
  it('A150 S1: Stagehand can be played as the first occupation in a four-player game', () => {
    expect(playOccupation(setup('A150_Stagehand', 0, false), 'A150_Stagehand')
      .state.players[0]!.occupationPlayed).toContain('A150_Stagehand')
  })

  it('A150 S2: after an opponent uses Traveling Players the owner may build a room at normal cost', () => {
    const session = setup('A150_Stagehand', 1)
    let response = session.takeAction(1, 'traveling-players')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-player-switch', fromPlayerIndex: 1, toPlayerIndex: 0 } })
    response = confirmPlayerSwitch(session)
    response = chooseNonSkip(session, response, 'construct')
    response = buildFirstRoom(session, response)
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0 })
  })

  it('A150 S3: the Stagehand bonus action may be declined', () => {
    const session = setup('A150_Stagehand', 1)
    let response = session.takeAction(1, 'traveling-players')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-player-switch', fromPlayerIndex: 1, toPlayerIndex: 0 } })
    response = confirmPlayerSwitch(session)
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, sourceCard: 'A150_Stagehand', request: { kind: 'choice' } })
    response = session.resolveChoice(0, '__skip__')
    expect(response.state.players[0]!.rooms).toBe(2)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 5, reed: 2 })
  })

  it('A150 S4: the owner using Traveling Players does not trigger Stagehand', () => {
    const response = setup('A150_Stagehand').takeAction(0, 'traveling-players')
    expect(response.state.players[0]!.rooms).toBe(2)
    expect(response.interaction.stateId !== 'wait' || response.interaction.sourceCard !== 'A150_Stagehand').toBe(true)
  })
})

describe("A149 command boundaries", () => {
  const ARTIST = 'A149_HouseArtist'
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
        state.players[0]!.occupationPlayed = played ? [ARTIST] : []
        state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [ARTIST, 'A110_Roughcaster']
        configure(state)
      } }))
    return s
  }
  const beforeAction = new WeakMap<GameSession, { rules: string; interaction: string; actor: number }>()
  function turn(s: GameSession, actor: number, space: string) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.currentPlayerIndex, actor)
    beforeAction.set(s, { rules: undoRuleSnapshot(r), interaction: JSON.stringify(r.interaction), actor })
    return ok(s.takeAction(actor, space))
  }
  function undo(s: GameSession) {
    const before = beforeAction.get(s)
    assert.ok(before)
    const undone = s.undoAction()
    assertUndoRestored(before.rules, undone)
    assertUndoRestored(before.rules, s.getState())
    assert.equal(JSON.stringify(undone.interaction), before.interaction)
    assert.equal(JSON.stringify(s.getState().interaction), before.interaction)
    assert.equal(undone.interaction.stateId, 'idle')
    assert.equal(undone.state.currentPlayerIndex, before.actor)
    return undone
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
    assertTurnFinished(r, 0)
    return r
  }
  function artist(wood: number, reed: number, played = true) {
    return setup(state => {
      Object.assign(state.players[0]!.resources, { wood, reed })
      state.actionSpaces.find(a => a.id === 'traveling-players')!.resources.food = 2
    }, played)
  }
  it("actual Traveling Players builds one or two rooms with one reed discount per room", () => {
    for (const count of [1, 2]) {
      const s = artist(count * 5, count)
      let r = turn(s, 0, 'traveling-players')
      for (let n = 0; n < 8 && r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice'; n++) {
        const o = getChoiceOptions(r).find(o => o.value !== '__skip__' && o.value !== '__done__' && !o.disabled)
        assert.ok(o)
        r = ok(s.resolveChoice(0, o.value))
      }
      assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select')
      r = ok(s.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }, { row: 2, col: 1 }].slice(0, count) }))
      r = drive(s, r, null)
      assert.equal(r.state.players[0]!.rooms, 2 + count)
      assert.equal(r.state.players[0]!.resources.reed, 0)
      assert.equal(r.state.players[0]!.resources.wood, 0)
      assert.equal(r.state.players[0]!.resources.food, 42)
      save(`A149-N1-${count}`, r)
    }
  })
  it("ordinary Farm Expansion and hand cannot use Traveling Players discount", () => {
    const ordinary = artist(5, 1)
    const pending = turn(ordinary, 0, 'farm-expansion')
    assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'farm-select')
    assertRejectedUnchanged(ordinary, () => ordinary.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }] }))
    const hs = artist(5, 1, false)
    const hand = turn(hs, 0, 'traveling-players')
    assertTurnFinished(hand, 0)
    assert.equal(hand.state.players[0]!.rooms, 2)
    assert.equal(hand.state.players[0]!.resources.reed, 1)
    save('A149-N2', hand)
  })
  it("decline insufficient wood and actual opponent cannot grant owner room", () => {
    const s = artist(5, 1)
    const declined = drive(s, turn(s, 0, 'traveling-players'), null)
    assert.equal(declined.state.players[0]!.rooms, 2)
    assert.equal(declined.state.players[0]!.resources.wood, 5)
    const ps = artist(4, 1)
    const poor = turn(ps, 0, 'traveling-players')
    assertTurnFinished(poor, 0)
    assertRejectedUnchanged(ps, () => ps.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }] }))
    assert.equal(poor.state.players[0]!.rooms, 2)
    const otherS = artist(5, 1)
    turn(otherS, 0, 'day-laborer')
    const other = turn(otherS, 1, 'traveling-players')
    assertTurnFinished(other, 1)
    assert.equal(other.state.players[0]!.rooms, 2)
    save('A149-N3', { declined, poor, other })
  })
  it("whole discounted build undo restores room cost and pile before retry", () => {
    const s = artist(5, 1)
    const first = drive(s, turn(s, 0, 'traveling-players'))
    const undone = undo(s)
    assert.equal(undone.state.players[0]!.rooms, 2)
    assert.equal(undone.state.players[0]!.resources.wood, 5)
    assert.equal(undone.state.players[0]!.resources.reed, 1)
    const retry = drive(s, turn(s, 0, 'traveling-players'))
    assert.equal(retry.state.players[0]!.rooms, 3)
    save('A149-N4', { first, undone, retry })
  })
})
