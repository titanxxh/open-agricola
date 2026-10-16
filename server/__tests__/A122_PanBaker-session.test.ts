import { captureStateWithHistory } from '../../shared/session/history-streams'
import { assertUndoRestored, undoRuleSnapshot } from './_helpers/session-assertions'
import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A122_PanBaker'
import '../../shared/cards/B/B130_FullPeasant'
import '../../shared/cards/D/D066_PotterCeramics'
import '../../shared/cards/D/D075_WoodField'
import assert from 'node:assert/strict'
import { type GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A122_PanBaker'

const setup = (options: {
  minorPlayed?: string[]
  improvements?: string[]
} = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  state.roundActionOrder = state.roundActionOrder.map(() => null)
  state.roundActionOrder[0] = 'grain-utilization'

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources = {
    ...player.resources,
    wood: 0,
    clay: 0,
    grain: 0,
    food: 0,
  }
  player.occupationPlayed.push(CARD_ID)
  player.minorPlayed.push(...(options.minorPlayed ?? ['D066_PotterCeramics']))
  player.improvements = options.improvements ?? ['Major_Fireplace1']
  player.fields = []

  session.loadState(state)
  return session
}

describe('A122 Pan Baker session', () => {
  it('makes Grain Utilization available and supplies D66 before Bake Bread', () => {
    const session = setup()

    expect(session.getActionAvailability(0)['grain-utilization']).toBe(true)

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 2, grain: 0 })
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.sourceCard).toBe('D066_PotterCeramics')

    const accept = getChoiceOptions(resp)?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    resp = session.resolveChoice(0, accept!.value)
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionBakeBreadChoice') {
      resp = session.resolveChoice(0, 'Major_Fireplace1')
    }

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 1, grain: 0, food: 2 })
    expect(resp.state.actionSpaces.find((space) => space.id === 'grain-utilization')!.takenBy).toHaveLength(1)
  })

  it('makes Grain Utilization available and supplies wood before sowing D75', () => {
    const session = setup({ minorPlayed: ['D075_WoodField'], improvements: [] })

    expect(session.getActionAvailability(0)['grain-utilization']).toBe(true)

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 2, grain: 0 })
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait' || resp.interaction.request.kind !== 'farm-select' || resp.interaction.request.farm.farmType !== 'sow') {
      throw new Error('expected sow interaction')
    }

    resp = session.commitSelectionChoice(0, {
      crops: [{ row: -1, col: 4075, crop: 'wood' }],
    })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 2, grain: 0 })
    expect(readCardExtraData(resp.state.players[0]!, 'D075_WoodField', 'cardFieldStacks')).toEqual([
      { crop: 'wood', remaining: 3 },
      null,
    ])
  })

  it('gains resources once when B130 jumps to Grain Utilization', () => {
    const session = setup({ minorPlayed: ['D075_WoodField'], improvements: [] })
    const state = session.getState().state
    const player = state.players[0]!
    state.round = 5
    state.roundActionOrder[1] = 'fencing'
    player.occupationPlayed.push('B130_FullPeasant')
    player.resources.wood = 4
    player.resources.food = 1
    session.loadState(state)

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    resp = session.commitSelectionChoice(0, {
      edges: ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2'],
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.sourceCard).toBe('B130_FullPeasant')

    const accept = getChoiceOptions(resp)?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    resp = session.resolveChoice(0, accept!.value)

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 2, food: 0 })
  })
})

describe('A122 Pan Baker parity', () => {
  const CARD_ID = 'A122_PanBaker'

  const WOOD_FIELD = 'D075_WoodField'

  const FILLER = '__test_placeholder__'

  const setup = ({
    played = true, actor = 0, woodField = false, ownerWood = 0, ownerClay = 0,
  } = {}) => {
    const session = sessionEvidence.track(createWorkSession({ seed: 6122, options: { playerCount: 2 } }))
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = actor
    state.round = 14
    state.roundPhase = 'work'
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    state.roundActionOrder[9] = 'grain-utilization'
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.fields = []
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0,
      }
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    owner.minorPlayed = woodField ? [WOOD_FIELD] : []
    owner.resources.wood = ownerWood
    owner.resources.clay = ownerClay
    if (actor === 1) {
      const opponent = state.players[1]!
      opponent.resources.grain = 1
      opponent.fields = [{ row: 0, col: 1, stacks: [] }]
    }
    session.loadState(state)
    return session
  }

  it('A122 S3: a non-Grain-Utilization action grants no wood or clay', () => {
    const response = setup().takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0 })
  })

  it('A122 S4: an opponent using Grain Utilization grants the owner no resources', () => {
    const session = setup({ actor: 1 })
    expect(session.getState().state.players[1]!.roomTiles).toEqual([{ row: 2, col: 0 }, { row: 1, col: 0 }])
    expect(session.getState().state.players[1]!.fields).toEqual([{ row: 0, col: 1, stacks: [] }])
    const response = session.takeAction(1, 'grain-utilization')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0 })
  })
})

describe("A122 command boundaries", () => {
  const PAN = 'A122_PanBaker', FIELD = 'D075_WoodField'
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(configure: (state: GameState) => void = () => {
  }, played = true) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
        state.round = 14
        for (const p of state.players)
          Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        state.players[0]!.occupationPlayed = played ? [PAN] : []
        state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [PAN]
        state.players[0]!.fields = [{ row: 0, col: 1, stacks: [] }, { row: 0, col: 2, stacks: [] }]
        state.players[0]!.resources.grain = 2
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
  function sow(s: GameSession, r: SessionResponse) {
    for (let n = 0; n < 5 && r.interaction.stateId === 'wait' && r.interaction.request.kind !== 'farm-select'; n++) {
      const i = r.interaction
      assert.ok(i.request.kind === 'choice' || i.request.kind === 'select-trigger')
      const o = getChoiceOptions({ interaction: i }).find(o => o.value !== '__skip__' && o.value !== '__done__')
      assert.ok(o)
      r = ok(s.resolveChoice(0, o.value))
    }
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'sow')
    return r
  }
  it("real Grain Utilization adds two clay one wood before ordinary sow once", () => {
    const s = setup()
    const pending = sow(s, turn(s, 0, 'grain-utilization'))
    assert.equal(pending.state.players[0]!.resources.clay, 2)
    assert.equal(pending.state.players[0]!.resources.wood, 1)
    const r = ok(s.commitSelectionChoice(0, { crops: [{ row: 0, col: 1, crop: 'grain' }] }))
    assert.ok(r.interaction.stateId === 'wait')
    assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    assert.equal(r.state.players[0]!.resources.clay, 2)
    assert.equal(r.state.players[0]!.resources.wood, 1)
    assert.equal(r.state.players[0]!.resources.grain, 1)

    sessionEvidence.record('A122-N1', { pending, r })
  })
  it("incoming wood unlocks card field sow from empty reserve", () => {
    const s = setup(state => {
      const p = state.players[0]!
      p.fields = []
      p.resources.grain = 0
      p.minorPlayed = [FIELD]
    })
    assert.equal(s.getActionAvailability(0)['grain-utilization'], true)
    const pending = sow(s, turn(s, 0, 'grain-utilization'))
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { crops: [{ row: -1, col: 4075, crop: 'grain' }] }))
    const r = ok(s.commitSelectionChoice(0, { crops: [{ row: -1, col: 4075, crop: 'wood' }] }))
    assert.ok(r.interaction.stateId === 'wait')
    assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.resources.clay, 2)
    assert.deepEqual(readCardExtraData(r.state.players[0]!, FIELD, 'cardFieldStacks'), [{ crop: 'wood', remaining: 3 }, null])

    sessionEvidence.record('A122-N2', { pending, r })
  })
  it("hand unrelated Day Laborer and opponent use cannot reward owner", () => {
    const basic = turn(setup(), 0, 'day-laborer')
    assert.ok(basic.interaction.stateId === 'wait')
    assert.deepEqual(basic.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(basic.interaction.playerIndex, 0)
    assert.equal(basic.state.currentPlayerIndex, 0)
    assert.equal(basic.state.players[0]!.resources.clay, 0)
    assert.equal(basic.state.players[0]!.resources.wood, 0)
    const handS = setup(undefined, false)
    sow(handS, turn(handS, 0, 'grain-utilization'))
    const hand = ok(handS.commitSelectionChoice(0, { crops: [{ row: 0, col: 1, crop: 'grain' }] }))
    assert.ok(hand.interaction.stateId === 'wait')
    assert.deepEqual(hand.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(hand.interaction.playerIndex, 0)
    assert.equal(hand.state.currentPlayerIndex, 0)
    assert.equal(hand.state.players[0]!.resources.clay, 0)
    assert.equal(hand.state.players[0]!.resources.wood, 0)
    const s = setup(state => {
      state.players[1]!.fields = [{ row: 0, col: 1, stacks: [] }]
      state.players[1]!.resources.grain = 1
    })
    turn(s, 0, 'day-laborer')
    const pending = turn(s, 1, 'grain-utilization')
    assert.equal(pending.state.players[0]!.resources.clay, 0)
    assert.equal(pending.state.players[0]!.resources.wood, 0)

    assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'farm-select')
    assert.deepEqual(pending.interaction.request.farm, {
      farmType: 'sow',
      maxSeedSelections: undefined,
      maxSelections: undefined,
      minSelections: undefined,
      selectableFields: [{ tile: { row: 0, col: 1 }, allowedCrops: ['grain'] }],
    })
    assert.equal(pending.interaction.playerIndex, 1)
    assert.equal(pending.state.currentPlayerIndex, 1)
    sessionEvidence.record('A122-N3', { basic, hand, pending })
  })
  it("incoming bonus attempt blocks with retained resources and explicit undo removes them", () => {
    const s = setup(state => {
      state.players[0]!.fields = []
      state.players[0]!.resources.grain = 0
    })
    assert.equal(s.getActionAvailability(0)['grain-utilization'], true)
    const observedBeforeUndo = s.getState()
    const beforeUndo = {
      ...observedBeforeUndo,
      state: captureStateWithHistory(observedBeforeUndo.state),
      interaction: structuredClone(observedBeforeUndo.interaction),
      scores: structuredClone(observedBeforeUndo.scores),
    }
    const beforeRules = undoRuleSnapshot(beforeUndo)
    const attempted = turn(s, 0, 'grain-utilization')
    assert.ok(attempted.interaction.stateId === 'wait' && attempted.interaction.request.kind === 'engine-blocked')
    assert.equal(attempted.state.players[0]!.resources.clay, 2)
    assert.equal(attempted.state.players[0]!.resources.wood, 1)
    const undone = ok(s.undoAction())
    assertUndoRestored(beforeRules, undone)
    const liveAfterUndo = s.getState()
    assertUndoRestored(beforeRules, liveAfterUndo)
    assert.deepEqual(liveAfterUndo.interaction, beforeUndo.interaction)
    assert.equal(liveAfterUndo.state.currentPlayerIndex, 0)
    assert.deepEqual(undone.interaction, beforeUndo.interaction)
    assert.equal(undone.interaction.stateId, 'idle')
    assert.equal(undone.state.currentPlayerIndex, 0)
    assert.equal(undone.state.players[0]!.resources.clay, 0)
    assert.equal(undone.state.players[0]!.resources.wood, 0)
    assert.equal(undone.interaction.stateId, 'idle')
    assert.equal(undone.state.currentPlayerIndex, 0)
    sessionEvidence.record('A122-N4', { attempted, undone, acceptedDifference: 'ADR0015 permits a startable before chain, then blocks the mandatory unavailable body and retains effects until explicit undo' })
  })
  it("whole action undo removes bonus and crop stack before exactly one retry", () => {
    const s = setup()
    const observedBeforeUndo = s.getState()
    const beforeUndo = {
      ...observedBeforeUndo,
      state: captureStateWithHistory(observedBeforeUndo.state),
      interaction: structuredClone(observedBeforeUndo.interaction),
      scores: structuredClone(observedBeforeUndo.scores),
    }
    const beforeRules = undoRuleSnapshot(beforeUndo)
    sow(s, turn(s, 0, 'grain-utilization'))
    const first = ok(s.commitSelectionChoice(0, { crops: [{ row: 0, col: 1, crop: 'grain' }] }))
    assert.ok(first.interaction.stateId === 'wait')
    assert.deepEqual(first.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(first.interaction.playerIndex, 0)
    assert.equal(first.state.currentPlayerIndex, 0)
    assert.equal(first.state.players[0]!.resources.wood, 1)
    assert.equal(first.state.players[0]!.resources.clay, 2)
    assert.equal(first.state.players[0]!.resources.grain, 1)
    assert.deepEqual(first.state.players[0]!.fields.map(field => field.stacks), [[{ kind: 'grain', remaining: 3 }], []])
    const undone = ok(s.undoAction())
    assertUndoRestored(beforeRules, undone)
    const liveAfterUndo = s.getState()
    assertUndoRestored(beforeRules, liveAfterUndo)
    assert.deepEqual(liveAfterUndo.interaction, beforeUndo.interaction)
    assert.equal(liveAfterUndo.state.currentPlayerIndex, 0)
    assert.deepEqual(undone.interaction, beforeUndo.interaction)
    assert.equal(undone.interaction.stateId, 'idle')
    assert.equal(undone.state.currentPlayerIndex, 0)
    assert.equal(undone.state.players[0]!.resources.wood, 0)
    assert.equal(undone.state.players[0]!.resources.clay, 0)
    assert.equal(undone.state.players[0]!.resources.grain, 2)
    sow(s, turn(s, 0, 'grain-utilization'))
    const retry = ok(s.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'grain' }] }))
    assert.ok(retry.interaction.stateId === 'wait')
    assert.deepEqual(retry.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(retry.interaction.playerIndex, 0)
    assert.equal(retry.state.currentPlayerIndex, 0)
    assert.equal(retry.state.players[0]!.resources.wood, 1)
    assert.equal(retry.state.players[0]!.resources.clay, 2)

    sessionEvidence.record('A122-N5', { first, undone, retry })
  })
})
