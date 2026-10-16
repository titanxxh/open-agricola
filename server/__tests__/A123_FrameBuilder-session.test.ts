import { captureStateWithHistory } from '../../shared/session/history-streams'
import { assertUndoRestored, undoRuleSnapshot } from './_helpers/session-assertions'
import type { ActionChoiceOption } from '../../shared/contract/types'
import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A123_FrameBuilder'
import assert from 'node:assert/strict'
import { type GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A123_FrameBuilder'

const setup = ({
  houseType = 'wood',
  resources = {},
  inHand = false,
}: {
  houseType?: 'wood' | 'clay' | 'stone'
  resources?: Partial<Record<'wood' | 'clay' | 'stone' | 'reed', number>>
  inHand?: boolean
} = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 123, options: { playerCount: 2 } }))
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 6
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.occupationHand = inHand ? [CARD_ID] : ['__test_placeholder__']
  player.occupationPlayed = inHand ? [] : [CARD_ID]
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

const chooseOption = (session: GameSession, response: SessionResponse, predicate: (option: ActionChoiceOption) => boolean) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = getChoiceOptions(response)?.find(predicate)
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

const openRoomSelection = (session: GameSession) => {
  let response = session.takeAction(0, 'farm-expansion')
  if (
    response.interaction.stateId === 'wait'
    && getChoiceOptions(response)?.some((option) => option.labelKey === 'actions.construct.name')
  ) {
    response = chooseOption(session, response, (option) => option.labelKey === 'actions.construct.name')
  }
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  expect(roomFarm(response).farmType).toBe('room')
  return response
}

const renovate = (session: GameSession) => {
  let response = session.takeAction(0, 'house-redevelopment')
  if (response.interaction.stateId === 'wait' && response.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
    response = session.resolveChoice(0, 'clay')
  }
  return response
}

describe('A123 Frame Builder parity', () => {
  it('A123 S1: playing Frame Builder through Lessons keeps the occupation in play', () => {
    const session = setup({ inHand: true })
    let response = session.takeAction(0, 'lessons')
    if (response.interaction.stateId === 'wait') {
      const option = getChoiceOptions(response)?.find((candidate) => candidate.value === CARD_ID)
      if (option) response = session.resolveChoice(0, option.value)
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('A123 S2: each of two clay rooms can replace two clay with one wood', () => {
    const session = setup({ houseType: 'clay', resources: { clay: 6, wood: 2, reed: 4 } })
    const selection = openRoomSelection(session)
    if (selection.interaction.stateId !== 'wait' || roomFarm(selection).farmType !== 'room') return
    const [roomA, roomB] = roomFarm(selection).selectableTiles

    const response = session.commitSelectionChoice(0, { rooms: [roomA!, roomB!] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(4)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, wood: 0, reed: 0 })
  })

  it('A123 S3: a stone room can replace two stone with one wood', () => {
    const session = setup({ houseType: 'stone', resources: { stone: 3, wood: 1, reed: 2 } })
    const selection = openRoomSelection(session)
    if (selection.interaction.stateId !== 'wait' || roomFarm(selection).farmType !== 'room') return
    const room = roomFarm(selection).selectableTiles[0]!

    const response = session.commitSelectionChoice(0, { rooms: [room] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 0, wood: 0, reed: 0 })
  })

  it('A123 S4: renovation can replace two clay with one wood', () => {
    const response = renovate(setup({ resources: { wood: 1, reed: 1 } }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('clay')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0 })
  })

  it('A123 S5: renovation can decline the optional replacement', () => {
    const session = setup({ resources: { clay: 2, wood: 1, reed: 1 } })
    const payment = renovate(session)

    const response = chooseOption(session, payment, (option) => {
      const preview = option.effectPreview
      return preview?.kind === 'payment' && preview.resourcesPaid?.clay === 2 && (preview.resourcesPaid.wood ?? 0) === 0
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('clay')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, wood: 1, reed: 0 })
  })
})


function roomFarm(response: SessionResponse) {
  assert.ok(response.interaction.stateId === 'wait')
  assert.ok(response.interaction.request.kind === 'farm-select')
  const farm = response.interaction.request.farm
  assert.ok(farm.farmType === 'room')
  return farm
}
describe("A123 command boundaries", () => {
  const FRAME = 'A123_FrameBuilder'
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(configure: (state: GameState) => void = () => {
  }, played = true, round = 5) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
        state.round = round
        for (const p of state.players)
          Object.assign(p.resources, { food: 40, wood: 10, clay: 10, reed: 4, stone: 10, grain: 0, vegetable: 0 })
        state.players[0]!.occupationPlayed = played ? [FRAME] : []
        state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [FRAME, 'A110_Roughcaster']
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
  function optional(s: GameSession, r: SessionResponse, actor = 0, continuation: 'stables' | 'improvement' = 'stables') {
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
      assert.deepEqual(getChoiceOptions(r).map(option => option.labelKey), continuation === 'stables'
        ? ['actions.stables.name', 'ui.interactionFlowDone']
        : ['actions.improvement.name', 'ui.interactionOptionalSkip'])
      r = ok(s.resolveChoice(actor, continuation === 'stables' ? '__done__' : '__skip__'))
    }
    return r
  }
  function renovation(s: GameSession, actor = 0) {
    let r = turn(s, actor, 'house-redevelopment')
    if (r.interaction.stateId === 'wait' && r.interaction.promptKey === 'ui.interactionChooseRenovationTarget')
      r = ok(s.resolveChoice(actor, r.state.players[actor]!.houseType === 'wood' ? 'clay' : 'stone'))
    if (r.interaction.stateId === 'wait' && r.interaction.promptKey === 'prompt.selectPayment') {
      const o = r.interaction.request.kind === 'choice' ? getChoiceOptions(r).find(o => o.value !== 'cancel') : undefined
      assert.ok(o)
      r = ok(s.resolveChoice(actor, o.value))
    }
    return optional(s, r, actor, 'improvement')
  }
  function startBuild(s: GameSession) {
    let r = turn(s, 0, 'farm-expansion')
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
      const o = getChoiceOptions(r).find(o => o.labelKey === 'actions.construct.name')
      assert.ok(o)
      r = ok(s.resolveChoice(0, o.value))
    }
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select')
    return r
  }
  function build(s: GameSession, count: number) {
    startBuild(s)
    let r = ok(s.commitSelectionChoice(0, { rooms: Array.from({ length: count }, (_, i) => ({ row: 1 + i, col: 1 })) }))
    if (r.interaction.stateId === 'wait' && r.interaction.promptKey === 'prompt.selectPayment') {
      const o = r.interaction.request.kind === 'choice' ? getChoiceOptions(r).find(o => o.value !== 'cancel') : undefined
      assert.ok(o)
      r = ok(s.resolveChoice(0, o.value))
    }
    return optional(s, r)
  }
  it("each of one and two clay or stone rooms substitutes at most once per room", () => {
    for (const material of ['clay', 'stone'] as const)
      for (const count of [1, 2]) {
        const s = setup(state => {
          const p = state.players[0]!
          p.houseType = material
          Object.assign(p.resources, { wood: count, clay: 0, stone: 0, reed: 2 * count })
          p.resources[material] = 3 * count
        })
        const r = build(s, count)
        assert.ok(r.interaction.stateId === 'wait')
        assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
        assert.equal(r.interaction.playerIndex, 0)
        assert.equal(r.state.currentPlayerIndex, 0)
        assert.equal(r.state.players[0]!.rooms, 2 + count)
        assert.equal(r.state.players[0]!.resources[material], 0)
        assert.equal(r.state.players[0]!.resources.wood, 0)
        assert.equal(r.state.players[0]!.resources.reed, 0)

        sessionEvidence.record(`A123-N1-${material}-${count}`, r)
      }
  })
  it("extra wood cannot replace a second pair in one room and legal retry keeps cost exact", () => {
    const s = setup(state => {
      const p = state.players[0]!
      p.houseType = 'clay'
      Object.assign(p.resources, { wood: 2, clay: 4, reed: 2 })
    })
    startBuild(s)
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }, { row: 2, col: 1 }] }))
    const r = optional(s, ok(s.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }] })))
    assert.ok(r.interaction.stateId === 'wait')
    assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    assert.equal(r.state.players[0]!.rooms, 3)
    assert.equal(r.state.players[0]!.resources.clay, 1)
    assert.equal(r.state.players[0]!.resources.wood, 1)

    sessionEvidence.record('A123-N2', r)
  })
  it("wood room and unplayed card use ordinary room costs without substitution", () => {
    const wood = build(setup(state => Object.assign(state.players[0]!.resources, { wood: 5, reed: 2 })), 1)
    assert.ok(wood.interaction.stateId === 'wait')
    assert.deepEqual(wood.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(wood.interaction.playerIndex, 0)
    assert.equal(wood.state.currentPlayerIndex, 0)
    assert.equal(wood.state.players[0]!.resources.wood, 0)
    const hand = build(setup(state => {
      state.players[0]!.houseType = 'clay'
      Object.assign(state.players[0]!.resources, { clay: 5, wood: 1, reed: 2 })
    }, false), 1)
    assert.ok(hand.interaction.stateId === 'wait')
    assert.deepEqual(hand.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(hand.interaction.playerIndex, 0)
    assert.equal(hand.state.currentPlayerIndex, 0)
    assert.equal(hand.state.players[0]!.resources.clay, 0)
    assert.equal(hand.state.players[0]!.resources.wood, 1)

    sessionEvidence.record('A123-N3', { wood, hand })
  })
  it("actual two room renovation trades exactly two material for one wood once", () => {
    for (const material of ['wood', 'clay'] as const) {
      const s = setup(state => {
        const p = state.players[0]!
        p.houseType = material
        Object.assign(p.resources, { wood: 1, clay: 0, stone: 0, reed: 1 })
      }, true, 14)
      const r = renovation(s)
      assert.ok(r.interaction.stateId === 'wait')
      assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
      assert.equal(r.interaction.playerIndex, 0)
      assert.equal(r.state.currentPlayerIndex, 0)
      assert.equal(r.state.players[0]!.houseType, material === 'wood' ? 'clay' : 'stone')
      assert.equal(r.state.players[0]!.resources.wood, 0)
      assert.equal(r.state.players[0]!.resources.reed, 0)

      sessionEvidence.record(`A123-N4-${material}`, r)
    }
  })
  it("rejected room actor target and whole undo cannot retain paid replacement or room", () => {
    const s = setup(state => {
      state.players[0]!.houseType = 'clay'
      Object.assign(state.players[0]!.resources, { wood: 1, clay: 3, reed: 2 })
    })
    const observedBeforeUndo = s.getState()
    const beforeUndo = {
      ...observedBeforeUndo,
      state: captureStateWithHistory(observedBeforeUndo.state),
      interaction: structuredClone(observedBeforeUndo.interaction),
      scores: structuredClone(observedBeforeUndo.scores),
    }
    const beforeRules = undoRuleSnapshot(beforeUndo)
    startBuild(s)
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(1, { rooms: [{ row: 1, col: 1 }] }))
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { rooms: [{ row: 99, col: 99 }] }))
    const first = optional(s, ok(s.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }] })))
    assert.ok(first.interaction.stateId === 'wait')
    assert.deepEqual(first.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(first.interaction.playerIndex, 0)
    assert.equal(first.state.currentPlayerIndex, 0)
    assert.equal(first.state.players[0]!.rooms, 3)
    assert.ok(first.state.players[0]!.roomTiles.some(tile => tile.row === 1 && tile.col === 1))
    assert.deepEqual({ wood: first.state.players[0]!.resources.wood, clay: first.state.players[0]!.resources.clay, reed: first.state.players[0]!.resources.reed }, { wood: 0, clay: 0, reed: 0 })
    const undone = ok(s.undoAction())
    assertUndoRestored(beforeRules, undone)
    const liveAfterUndo = s.getState()
    assertUndoRestored(beforeRules, liveAfterUndo)
    assert.deepEqual(liveAfterUndo.interaction, beforeUndo.interaction)
    assert.equal(liveAfterUndo.state.currentPlayerIndex, 0)
    assert.deepEqual(undone.interaction, beforeUndo.interaction)
    assert.equal(undone.interaction.stateId, 'idle')
    assert.equal(undone.state.currentPlayerIndex, 0)
    assert.equal(undone.state.players[0]!.rooms, 2)
    assert.equal(undone.state.players[0]!.resources.clay, 3)
    assert.equal(undone.state.players[0]!.resources.wood, 1)
    const retry = build(s, 1)
    assert.ok(retry.interaction.stateId === 'wait')
    assert.deepEqual(retry.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(retry.interaction.playerIndex, 0)
    assert.equal(retry.state.currentPlayerIndex, 0)
    assert.equal(retry.state.players[0]!.resources.wood, 0)

    sessionEvidence.record('A123-N5', { first, undone, retry })
  })
})
