import { assertUndoRestored, undoRuleSnapshot } from './_helpers/session-assertions'
import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A117_WoodCarrier'
import assert from 'node:assert/strict'
import { type GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A117_WoodCarrier'

const setup = ({
  minors = [],
  majors = [],
  occupations = [],
}: {
  minors?: string[]
  majors?: string[]
  occupations?: string[]
} = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 117, options: { playerCount: 2 } }))
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.occupationHand = [CARD_ID]
  player.occupationPlayed = occupations
  player.minorPlayed = minors
  player.improvements = majors
  player.resources.food = 2
  player.resources.wood = 0
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  const option = getChoiceOptions(response)?.find((entry) => entry.value === CARD_ID)
  if (option) response = session.resolveChoice(0, option.value)
  return response
}

describe('A117 Wood Carrier parity', () => {
  it('A117 S1: playing Wood Carrier with no improvements grants no wood', () => {
    const response = playOccupation(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('A117 S2: two minor improvements grant two wood when Wood Carrier is played', () => {
    const response = playOccupation(setup({ minors: ['A037_Bucksaw', 'A050_MilkJug'] }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(2)
  })

  it('A117 S3: one major and two minor improvements grant three wood', () => {
    const response = playOccupation(setup({
      minors: ['A037_Bucksaw', 'A050_MilkJug'],
      majors: ['Major_Fireplace1'],
    }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(3)
  })

  it('A117 S4: an existing occupation does not increase Wood Carrier wood', () => {
    const response = playOccupation(setup({ occupations: ['A103_Portmonger'] }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })
})

describe("A117 command boundaries", () => {
  const CARRIER = 'A117_WoodCarrier'
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(configure: (state: GameState) => void = () => {
  }) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
        state.round = 14
        for (const p of state.players)
          Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, food: 40 })
        state.players[0]!.occupationHand = [CARRIER, 'A110_Roughcaster']
        configure(state)
      } }))
    return s
  }
  function play(s: GameSession, card: string) {
    let r = ok(s.takeAction(0, 'lessons'))
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
    const option = getChoiceOptions(r).find(option => option.value === card && !option.disabled)
    assert.ok(option)
    assertRejectedUnchanged(s, () => s.resolveChoice(1, option.value))
    r = ok(s.resolveChoice(0, option.value))
    assert(r.state.players[0]!.occupationPlayed.includes(card))
    assert(r.state.log.length > 0)
    return r
  }
  it("real Lessons purchase counts zero one and mixed own improvements exactly", () => {
    for (const [minors, majors, expected] of [[[], [], 0], [['A030_BakingSheet'], [], 1], [['A030_BakingSheet', 'A016_RammedClay'], ['Major_Fireplace1'], 3]] as const) {
      const s = setup(state => {
        state.players[0]!.minorPlayed = [...minors]
        state.players[0]!.improvements = [...majors]
      })
      const r = play(s, CARRIER)
      assert.ok(r.interaction.stateId === 'wait')
      assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
      assert.equal(r.interaction.playerIndex, 0)
      assert.equal(r.state.currentPlayerIndex, 0)
      assert.equal(r.state.players[0]!.resources.wood, expected)
      assert.equal(r.state.players[0]!.resources.food, 40)

      sessionEvidence.record(`A117-N1-${expected}`, r)
    }
  })
  it("own hand opponent improvements and occupations do not count", () => {
    const s = setup(state => {
      state.players[0]!.minorHand = ['A030_BakingSheet']
      state.players[0]!.occupationPlayed = ['A110_Roughcaster']
      state.players[1]!.minorPlayed = ['A016_RammedClay']
      state.players[1]!.improvements = ['Major_Fireplace1']
    })
    const r = play(s, CARRIER)
    assert.ok(r.interaction.stateId === 'wait')
    assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.resources.food, 39)
    assert.equal(r.state.players[1]!.resources.wood, 0)

    sessionEvidence.record('A117-N2', r)
  })
  it("later improvement and stale occupation choice cannot repeat onBuy reward", () => {
    const s = setup(state => {
      state.players[0]!.minorPlayed = ['A016_RammedClay']
      state.players[0]!.minorHand = ['A030_BakingSheet', 'A043_FarmyardManure']
      state.players[0]!.houseAnimals = { '2-0': 'sheep' }
    })
    const first = play(s, CARRIER)
    assert.ok(first.interaction.stateId === 'wait')
    assert.deepEqual(first.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(first.interaction.playerIndex, 0)
    assert.equal(first.state.currentPlayerIndex, 0)
    assert.equal(first.state.players[0]!.resources.wood, 1)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, CARRIER))
    confirmNext(s, first)
    confirmNext(s, ok(s.takeAction(1, 'grain-seeds')))
    let r = ok(s.takeAction(0, 'meeting-place'))
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
    const action = getChoiceOptions(r).find(o => o.value.startsWith('action-improvement-'))
    assert.ok(action)
    r = ok(s.resolveChoice(0, action.value))
    if (!r.state.players[0]!.minorPlayed.includes('A030_BakingSheet'))
      r = ok(s.resolveChoice(0, 'A030_BakingSheet'))
    assert.ok(r.interaction.stateId === 'wait')
    assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    assert.equal(r.state.players[0]!.resources.wood, 1)

    sessionEvidence.record('A117-N3', { first, r })
  })
  it("zero food cannot pay later Lessons and undo restores reward before one retry", () => {
    const poor = setup(state => {
      state.players[0]!.occupationPlayed = ['A110_Roughcaster']
      state.players[0]!.resources.food = 0
      state.players[0]!.minorPlayed = ['A016_RammedClay']
    })
    assertRejectedUnchanged(poor, () => poor.takeAction(0, 'lessons'))
    const s = setup(state => state.players[0]!.minorPlayed = ['A016_RammedClay'])
    const beforeUndo = s.getState()
    const beforeRules = undoRuleSnapshot(beforeUndo)
    const first = play(s, CARRIER)
    assert.ok(first.interaction.stateId === 'wait')
    assert.deepEqual(first.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(first.interaction.playerIndex, 0)
    assert.equal(first.state.currentPlayerIndex, 0)
    const undone = ok(s.undoAction())
    assertUndoRestored(beforeRules, undone)
    assert.deepEqual(undone.interaction, beforeUndo.interaction)
    assert.equal(undone.interaction.stateId, 'idle')
    assert.equal(undone.state.currentPlayerIndex, 0)
    assert.equal(undone.state.players[0]!.resources.wood, 0)
    assert(undone.state.players[0]!.occupationHand.includes(CARRIER))
    const retry = play(s, CARRIER)
    assert.ok(retry.interaction.stateId === 'wait')
    assert.deepEqual(retry.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(retry.interaction.playerIndex, 0)
    assert.equal(retry.state.currentPlayerIndex, 0)
    assert.equal(retry.state.players[0]!.resources.wood, 1)

    sessionEvidence.record('A117-N4', { first, undone, retry })
  })
})
