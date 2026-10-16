import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A143_Stonecutter'
import '../../shared/cards/E/E047_SyrupTap'
import assert from 'node:assert/strict'
import { type GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext , getChoiceOptions , expectTileFarmSelection , undoRuleSnapshot , assertUndoRestored } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A143_Stonecutter'

const setup = ({
  played = true,
  houseType = 'wood',
  resources = {},
  minorHand = ['__test_placeholder__'],
}: {
  played?: boolean
  houseType?: 'wood' | 'clay' | 'stone'
  resources?: Partial<Record<'wood' | 'clay' | 'stone' | 'reed', number>>
  minorHand?: string[]
} = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 143, options: { playerCount: 3 } }))
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 6
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  })
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.occupationHand = played ? ['__test_placeholder__'] : [CARD_ID]
  player.occupationPlayed = played ? [CARD_ID] : []
  player.minorHand = minorHand
  player.houseType = houseType
  player.resources = {
    ...player.resources,
    wood: 0,
    clay: 0,
    stone: 0,
    reed: 0,
    ...resources,
  }
  session.loadState(state)
  return session
}

const chooseCardIfNeeded = (session: GameSession, response: ReturnType<GameSession['takeAction']>, cardId: string) => {
  if (response.interaction.stateId !== 'wait') return response
  const option = getChoiceOptions(response)?.find((candidate) => candidate.value === cardId)
  return option ? session.resolveChoice(0, option.value) : response
}

const openRoomSelection = (session: GameSession) => {
  let response = session.takeAction(0, 'farm-expansion')
  if (response.interaction.stateId === 'wait') {
    const construct = getChoiceOptions(response)?.find((option) => option.labelKey === 'actions.construct.name')
    if (construct) response = session.resolveChoice(0, construct.value)
  }
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  expect(expectTileFarmSelection(response, 'room').farmType).toBe('room')
  return response
}

describe('A143 Stonecutter parity', () => {
  it('A143 S1: playing Stonecutter through Lessons keeps the occupation in play', () => {
    const session = setup({ played: false })

    const response = chooseCardIfNeeded(session, session.takeAction(0, 'lessons'), CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('A143 S2: Basketmakers Workshop costs one fewer stone', () => {
    const session = setup({ resources: { stone: 1, reed: 2 } })

    const response = chooseCardIfNeeded(session, session.takeAction(0, 'major-improvement'), 'Major_Basket')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain('Major_Basket')
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 0, reed: 0 })
  })

  it('A143 S3: a one-stone minor improvement costs no stone', () => {
    const session = setup({ resources: { wood: 1 }, minorHand: ['E047_SyrupTap'] })
    let response = session.takeAction(0, 'meeting-place')
    if (response.interaction.stateId === 'wait') {
      const improvement = getChoiceOptions(response)?.find((option) =>
        option.value.startsWith('action-improvement-')
      )
      if (improvement) response = session.resolveChoice(0, improvement.value)
    }

    response = chooseCardIfNeeded(session, response, 'E047_SyrupTap')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain('E047_SyrupTap')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, stone: 0 })
  })

  it('A143 S4: eight stone pays for two stone rooms', () => {
    const session = setup({ houseType: 'stone', resources: { stone: 8, reed: 4 } })
    const selection = openRoomSelection(session)
    const farm = expectTileFarmSelection(selection, 'room')
    assert.ok(farm.farmType === 'room')
    expect(farm.maxSelections).toBe(2)
    const [roomA, roomB] = farm.selectableTiles

    const response = session.commitSelectionChoice(0, { rooms: [roomA!, roomB!] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(4)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 0, reed: 0 })
  })

  it('A143 S5: a two-room clay-to-stone renovation costs one fewer stone', () => {
    const session = setup({ houseType: 'clay', resources: { stone: 1, reed: 1 } })

    const response = session.takeAction(0, 'house-redevelopment')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('stone')
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 0, reed: 0 })
  })
})

describe("A143 command boundaries", () => {
  const CUTTER = 'A143_Stonecutter'
  function save(id: string, value: unknown) {
    sessionEvidence.record(id, value)
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(configure: (state: GameState) => void = () => {
  }, played = true) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: 3 }, configure(state) {
        state.round = 14
        for (const p of state.players)
          Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        state.players[0]!.occupationPlayed = played ? [CUTTER] : []
        state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [CUTTER, 'A110_Roughcaster']
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
    assert.ok(r.interaction.stateId === 'wait', JSON.stringify(r.interaction))
    assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    assert.equal(r.state.roundPhase, 'work')
    return r
  }
  function buy(s: GameSession, card: string) {
    let r = turn(s, 0, 'major-improvement')
    for (let n = 0; n < 10 && !r.state.players[0]!.improvements.includes(card); n++) {
      assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
      const o = getChoiceOptions(r).find(o => o.value === card || o.value === `major:${card}`) ?? getChoiceOptions(r).find(o => o.value.startsWith('action-improvement-'))
      assert.ok(o, JSON.stringify(r.interaction))
      r = ok(s.resolveChoice(r.interaction.playerIndex, o.value))
    }
    assert.ok(r.state.players[0]!.improvements.includes(card))
    assert.ok(r.interaction.stateId === 'wait', JSON.stringify(r.interaction))
    assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    assert.equal(r.state.roundPhase, 'work')
    return r
  }
  it("actual major purchases reduce stone by one while zero stone Fireplace cannot grant stone", () => {
    for (const [major, res] of [['Major_Joinery', { wood: 2, stone: 1 }], ['Major_Pottery', { clay: 2, stone: 1 }], ['Major_Basket', { reed: 2, stone: 1 }], ['Major_Well', { wood: 1, stone: 2 }], ['Major_Fireplace1', { clay: 2, stone: 0 }]] as const) {
      const s = setup(state => Object.assign(state.players[0]!.resources, res))
      const r = buy(s, major)
      assert.ok(r.state.players[0]!.improvements.includes(major))
      assert.equal(r.state.players[0]!.resources.stone, 0)
      save(`A143-N1-${major}`, r)
    }
  })
  it("one and two actual stone rooms cost four stone and two reed per room", () => {
    for (const count of [1, 2]) {
      const s = setup(state => {
        state.players[0]!.houseType = 'stone'
        Object.assign(state.players[0]!.resources, { stone: 4 * count, reed: 2 * count })
      })
      let r = turn(s, 0, 'farm-expansion')
      while (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
        const o = getChoiceOptions(r).find(o => o.labelKey === 'actions.construct.name')
        assert.ok(o)
        r = ok(s.resolveChoice(0, o.value))
      }
      assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select')
      r = ok(s.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }, { row: 2, col: 1 }].slice(0, count) }))
      r = drive(s, r, null)
      assert.equal(r.state.players[0]!.rooms, 2 + count)
      assert.equal(r.state.players[0]!.resources.stone, 0)
      assert.equal(r.state.players[0]!.resources.reed, 0)
      save(`A143-N2-${count}`, r)
    }
  })
  it("renovation discounts one stone total and ordinary clay room cannot grant stone", () => {
    const s = setup(state => {
      state.players[0]!.houseType = 'clay'
      Object.assign(state.players[0]!.resources, { stone: 1, reed: 1 })
    })
    const r = drive(s, turn(s, 0, 'house-redevelopment'), null)
    assert.equal(r.state.players[0]!.houseType, 'stone')
    assert.equal(r.state.players[0]!.resources.stone, 0)
    assert.equal(r.state.players[0]!.resources.reed, 0)
    const cs = setup(state => {
      state.players[0]!.houseType = 'clay'
      Object.assign(state.players[0]!.resources, { clay: 5, reed: 2 })
    })
    const clay = drive(cs, turn(cs, 0, 'farm-expansion'))
    assert.equal(clay.state.players[0]!.resources.stone, 0)
    assert.equal(clay.state.players[0]!.resources.clay, 0)
    save('A143-N3', { r, clay })
  })
  it("hand insufficient other material and illegal room payload cannot exploit discount", () => {
    const hs = setup(state => Object.assign(state.players[0]!.resources, { wood: 2, stone: 1 }), false)
    assertRejectedUnchanged(hs, () => hs.takeAction(0, 'major-improvement'))
    const poor = setup(state => Object.assign(state.players[0]!.resources, { wood: 1, stone: 1 }))
    assertRejectedUnchanged(poor, () => poor.takeAction(0, 'major-improvement'))
    const s = setup(state => {
      state.players[0]!.houseType = 'stone'
      Object.assign(state.players[0]!.resources, { stone: 4, reed: 2 })
    })
    let r = turn(s, 0, 'farm-expansion')
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
      const o = getChoiceOptions(r).find(o => o.labelKey === 'actions.construct.name')
      assert.ok(o)
      r = ok(s.resolveChoice(0, o.value))
    }
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { rooms: [{ row: 99, col: 99 }] }))
    const built = drive(s, r)
    assert.equal(built.state.players[0]!.rooms, 3)
    save('A143-N4', { r, built })
  })
  it("whole actual purchase undo restores discounted stone before one retry", () => {
    const s = setup(state => Object.assign(state.players[0]!.resources, { wood: 2, stone: 1 }))
    const first = buy(s, 'Major_Joinery')
    const undone = undo(s)
    assert.equal(undone.state.players[0]!.resources.stone, 1)
    assert.equal(undone.state.players[0]!.resources.wood, 2)
    assert.ok(!undone.state.players[0]!.improvements.includes('Major_Joinery'))
    const retry = buy(s, 'Major_Joinery')
    assert.equal(retry.state.players[0]!.resources.stone, 0)
    save('A143-N5', { first, undone, retry })
  })
})
